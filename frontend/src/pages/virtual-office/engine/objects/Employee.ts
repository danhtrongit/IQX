import { type Mesh, Vector3 } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ACTIVITIES, activitySpec, activityWeight, pickWeighted } from '../config/activities';
import { ELEVATOR } from '../config/layout';
import type { ActivityKind, Cell, DoorLike, EmployeeProfile, LineKind, OfficeWorld, Point, Slot } from '../types';
import { cellCenter, cellOf, rand } from '../utils/helpers';
import { mergeRigidParts, skinRigidParts } from '../utils/rig';
import { ALL_POSES, CharacterModel, type Pose } from './CharacterModel';
import { blobShadow } from './Decals';

const WALK_SPEED = 1.4; // metres per second
const TURN_SPEED = 9; // radians per second

export type TaskKind = ActivityKind | 'cheer' | 'stress' | 'greet' | 'idle' | 'fight' | 'dance';

/** One unit of behaviour: walk to `slot` (or stay put), hold a pose for `duration`, then continue with `then`. */
export interface Task {
  kind: TaskKind;
  slot?: Slot;
  duration: number;
  /** Standing in place behind the own desk chair. */
  standAtDesk?: boolean;
  /** Person disappears behind this door for the duration (restroom). */
  door?: DoorLike;
  partner?: Employee | null;
  line?: LineKind | null;
  /** Release this reserved slot when the task ends. */
  reserved?: boolean;
  onArrive?: () => void;
  onDone?: () => void;
  then?: Task;
}

const POSE: Partial<Record<TaskKind, Pose>> = {
  coffee: 'drink',
  water: 'drink',
  chat: 'talk',
  patrol: 'talk',
  spectate: 'talk',
  pingpong: 'pingpong',
  foosball: 'foosball',
  lunch: 'eat',
  phoneBooth: 'phone',
  deskPhone: 'sitPhone',
  stretch: 'stretch',
  server: 'present',
  consult: 'sitTalk',
  wait: 'sitIdle',
  meeting: 'sitTalk',
  cheer: 'cheer',
  stress: 'stress',
  greet: 'wave',
  sneakyGame: 'sitGame',
  scroll: 'sitScroll',
  nap: 'sleep',
  argue: 'argue',
  fight: 'fight',
  dance: 'dance',
};

const SEATED = new Set<TaskKind>(['lunch', 'deskPhone', 'consult', 'wait', 'meeting', 'sneakyGame', 'scroll', 'nap']);
const FALL_CHANCE = 0.04; // per walk
const FALL_MS = 3000;
const BOSS_SPOT_RANGE = 3.2; // metres
const MAX_AMBIENT_BUBBLES = 5;

type Mode = 'away' | 'walking' | 'falling' | 'working' | 'task' | 'idle';

interface Scheduler {
  delayedCall(ms: number, fn: () => void): void;
}

/** Office worker or visitor: behaviour loop + 3D character + speech bubble. */
export class Employee {
  readonly model: CharacterModel;
  readonly profile: EmployeeProfile;
  readonly home: Point;
  readonly homeCell: Cell;
  /** Visitors are fully directed by the scene. */
  autonomous: boolean;
  gx = 0;
  gy = 0;
  mode: Mode = 'idle';
  status = '';
  /** Scheduled sim-time (minutes) for arriving / leaving today. */
  arriveAt = 0;
  leaveAt = 0;

  private readonly world: OfficeWorld;
  private readonly time: Scheduler;
  private path: Point[] = [];
  private after: (() => void) | null = null;
  private timer = 0;
  private task: Task | null = null;
  private seated = false;
  private yaw = Math.PI;
  private targetYaw = Math.PI;
  private readonly bubbleEl: HTMLDivElement;
  private readonly bubble: CSS2DObject;
  private bubbleTimer = 0;
  private readonly tmp = new Vector3();
  private readonly shadow: Mesh;
  private token = 0;
  private fallAfter = Infinity;
  private fallTimer = 0;

  constructor(world: OfficeWorld, time: Scheduler, profile: EmployeeProfile, home: Point, homeCell: Cell, present = true) {
    this.world = world;
    this.time = time;
    this.profile = profile;
    this.home = home;
    this.homeCell = homeCell;
    this.autonomous = profile.role !== 'visitor';
    this.model = new CharacterModel(profile);
    mergeRigidParts(this.model, ALL_POSES);
    skinRigidParts(this.model.root);
    this.model.root.traverse((o) => {
      o.userData.employee = this;
      o.castShadow = false;
    });
    this.shadow = blobShadow(profile.isBoss ? 0.8 : 0.72);

    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'vo-bubble';
    this.bubble = new CSS2DObject(this.bubbleEl);
    this.bubble.center.set(0.5, 1);
    this.bubble.visible = false;

    if (present) this.startWork(rand(1000, 8000));
    else this.hide();
  }

  /** Objects to add to the 3D scene. */
  get objects() {
    return [this.model.root, this.shadow, this.bubble];
  }

  get isAway(): boolean {
    return this.mode === 'away';
  }

  get isWorking(): boolean {
    return this.mode === 'working';
  }

  get currentKind(): TaskKind | null {
    return this.task?.kind ?? null;
  }

  /** Free to be pulled into something else (meeting, consult, game partner). */
  get available(): boolean {
    return this.mode === 'working' && this.autonomous;
  }

  setSelected(on: boolean): void {
    this.model.setSelected(on);
  }

  /** Employees whose bubble is currently visible (shared across all instances). */
  private static readonly talking = new Set<Employee>();

  /**
   * Shows a speech bubble. `ambient` chatter (arrive/leave/work) is skipped when MAX_AMBIENT_BUBBLES are already
   * visible, so crowds stay readable; story beats (fights, falls, replies) always show.
   */
  say(text: string, ms = 3000, ambient = false): void {
    if (this.mode === 'away') return;
    if (ambient && !this.bubble.visible && Employee.talking.size >= MAX_AMBIENT_BUBBLES) return;
    this.bubbleEl.textContent = text;
    this.bubbleEl.classList.remove('vo-hide');
    this.bubble.visible = true;
    Employee.talking.add(this);
    this.bubbleTimer = ms;
  }

  /** Releases the model and any bubble slot; the caller removes `objects` from the scene. */
  dispose(): void {
    this.hideBubble();
    this.model.dispose();
  }

  private hideBubble(): void {
    this.bubble.visible = false;
    Employee.talking.delete(this);
  }

  // ---------------------------------------------------------------- public commands

  /** Interrupts whatever is going on and runs `task` (and its chain). */
  run(task: Task): void {
    this.endTask(false);
    this.begin(task);
  }

  /** Short reaction at the desk (cheer / stress) if currently working. */
  react(kind: 'cheer' | 'stress' | 'dance'): void {
    if (this.mode !== 'working' || !this.autonomous) return;
    this.run({ kind, duration: rand(2500, kind === 'dance' ? 5000 : 3800), standAtDesk: true, line: kind });
  }

  /** Steps out of the elevator and walks to the desk. */
  arrive(onArrived?: () => void): void {
    if (this.mode !== 'away') return;
    this.world.elevator.open();
    this.show();
    this.setPos(ELEVATOR.cell.x + 0.3, ELEVATOR.cell.y + 0.5);
    this.face(1, 0);
    this.time.delayedCall(rand(0, 1500), () => this.say(this.world.line(this.profile.role === 'visitor' ? 'visitor' : 'arrive'), 3000, true));
    if (onArrived) {
      this.mode = 'idle';
      this.time.delayedCall(500, onArrived);
    } else this.time.delayedCall(500, () => this.goHome());
  }

  /** Walks to the elevator and disappears. */
  leave(onGone?: () => void): void {
    if (this.mode === 'away') return;
    this.endTask(false);
    this.say(this.world.line('leave'), 3000, true);
    this.status = 'Đang ra về';
    const t = ++this.token;
    this.walkTo(ELEVATOR.cell, cellCenter(ELEVATOR.cell), () => {
      this.face(-1, 0);
      this.world.elevator.open();
      this.mode = 'idle';
      this.time.delayedCall(700, () => {
        if (t !== this.token) return;
        this.hide();
        onGone?.();
      });
    });
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    if (this.mode === 'away') return;
    if (this.mode === 'walking') this.stepWalk(dt);
    else if (this.mode === 'falling') {
      this.fallTimer -= dt;
      if (this.fallTimer <= 0) this.mode = 'walking';
    } else if (this.mode === 'working' || this.mode === 'task') {
      if (this.task?.kind === 'sneakyGame' && this.mode === 'task' && this.world.bossDistance(this) < BOSS_SPOT_RANGE) {
        this.say(this.world.line('caught'));
        this.endTask(false);
        this.startWork();
      }
      this.timer -= dt;
      if (this.timer <= 0) this.advance();
    }

    let diff = this.targetYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const step = (TURN_SPEED * dt) / 1000;
    this.yaw += Math.abs(diff) < step ? diff : Math.sign(diff) * step;
    this.model.root.position.set(this.gx, 0, this.gy);
    this.model.root.rotation.y = this.yaw;
    this.shadow.position.x = this.gx;
    this.shadow.position.z = this.gy;
    this.model.setPose(this.pose());
    this.model.update(dt / 1000);

    if (this.bubble.visible) {
      this.model.getHeadTop(this.tmp);
      this.bubble.position.set(this.tmp.x, this.tmp.y + 0.12, this.tmp.z);
      this.bubbleTimer -= dt;
      if (this.bubbleTimer < 300) this.bubbleEl.classList.add('vo-hide');
      if (this.bubbleTimer <= 0) this.hideBubble();
    }
  }

  private pose(): Pose {
    if (this.mode === 'walking') return 'walk';
    if (this.mode === 'falling') return 'fall';
    if (this.mode === 'working') {
      if (this.profile.isBoss && Math.sin(this.timer / 1500) > 0.6) return 'sitTalk';
      return 'type';
    }
    if (this.mode === 'task' && this.task) {
      if (this.task.kind === 'meeting' && this.profile.isBoss) return 'sitTalk';
      return POSE[this.task.kind] ?? (this.seated ? 'sitIdle' : 'idle');
    }
    return this.seated ? 'sit' : 'idle';
  }

  // ---------------------------------------------------------------- internals

  private setPos(x: number, y: number): void {
    this.gx = x;
    this.gy = y;
  }

  private face(dx: number, dy: number): void {
    if (Math.abs(dx) + Math.abs(dy) > 1e-4) this.targetYaw = Math.atan2(dx, dy);
  }

  private hide(): void {
    this.mode = 'away';
    this.task = null;
    this.path = [];
    this.model.root.visible = false;
    this.shadow.visible = false;
    this.hideBubble();
    this.status = 'Không có mặt';
    this.setPos(ELEVATOR.cell.x + 0.5, ELEVATOR.cell.y + 0.5);
  }

  private show(): void {
    this.model.root.visible = true;
    this.shadow.visible = true;
  }

  private advance(): void {
    if (this.mode === 'working') {
      if (this.autonomous) this.chooseActivity();
      else this.timer = 5000;
      return;
    }
    const done = this.task;
    this.endTask(true);
    if (done?.then) this.begin(done.then);
    else if (this.autonomous) this.goHome();
    else this.mode = 'idle';
  }

  /** Finishes the current task: frees its slot, reappears from behind a door, fires onDone. */
  private endTask(callDone: boolean): void {
    const t = this.task;
    if (!t) return;
    this.task = null;
    if (t.slot && t.reserved) this.world.releaseSlot(t.slot);
    if (t.door && !this.model.root.visible) {
      t.door.open();
      this.show();
    }
    if (callDone) t.onDone?.();
  }

  private startWork(duration = rand(9000, 22000)): void {
    this.mode = 'working';
    this.task = null;
    this.seated = true;
    this.setPos(this.home.x, this.home.y);
    this.face(this.profile.role === 'reception' ? 0 : 0, this.profile.role === 'reception' ? 1 : -1);
    this.timer = duration;
    this.status = this.profile.role === 'reception' ? 'Trực quầy lễ tân' : 'Đang làm việc';
    if (Math.random() < 0.3) {
      const t = this.token;
      this.time.delayedCall(rand(1500, Math.max(1600, duration - 2000)), () => {
        if (t === this.token && this.mode === 'working') this.say(this.world.line(this.profile.isBoss ? 'boss' : 'work'), 3000, true);
      });
    }
  }

  goHome(): void {
    this.task = null;
    this.status = 'Về chỗ ngồi';
    this.walkTo(this.homeCell, this.home, () => this.startWork());
  }

  private chooseActivity(): void {
    const period = this.world.period();
    const spec = pickWeighted(ACTIVITIES, (a) => activityWeight(a, this.profile.role, period));
    if (!spec) return this.startWork(4000);
    const duration = rand(...spec.duration);

    if (spec.inPlace) {
      this.begin({ kind: spec.kind, duration, standAtDesk: spec.kind === 'stretch', line: spec.kind });
      return;
    }
    if (spec.kind === 'chat') {
      const r = this.world.pickChatTarget(this);
      if (!r) return this.startWork(3000);
      this.begin({ kind: 'chat', slot: r.slot, duration, partner: r.target, line: 'chat' });
      return;
    }
    if (spec.kind === 'patrol') {
      this.begin({ kind: 'patrol', slot: this.world.pickPatrolSlot(), duration, line: 'patrol' });
      return;
    }
    if (spec.kind === 'argue') {
      const r = this.world.pickConfrontation(this);
      if (!r) return this.startWork(3000);
      const escalate = Math.random() < 0.4;
      const fight = (line: LineKind | null): Task => ({ kind: 'fight', duration: rand(3500, 5000), line });
      const callBoss = () => this.world.callBoss(r.mine);
      r.partner.run({
        kind: 'argue', slot: r.theirs, duration, line: null,
        then: escalate ? fight(null) : undefined,
      });
      this.begin({
        kind: 'argue', slot: r.mine, duration, line: 'argue',
        onArrive: () => this.time.delayedCall(1800, () => r.partner.say(this.world.line('argue'))),
        then: escalate ? { ...fight('fight'), onArrive: callBoss } : undefined,
      });
      return;
    }
    if (spec.pair) {
      const r = this.world.pickPair(spec.kind, this);
      if (!r) return this.startWork(3000);
      r.partner.run({ kind: spec.kind, slot: r.theirs, duration, reserved: true, line: null });
      this.begin({ kind: spec.kind, slot: r.mine, duration, reserved: true, line: spec.kind });
      return;
    }
    const slot = this.world.reserveSlot(spec.kind);
    if (!slot) return this.startWork(3000);
    this.begin({
      kind: spec.kind,
      slot,
      duration,
      reserved: true,
      line: spec.kind,
      door: spec.kind === 'restroom' ? this.world.restroom : undefined,
    });
  }

  private begin(task: Task): void {
    const token = ++this.token;
    this.task = task;
    const { label } = ACTIVITIES.some((a) => a.kind === task.kind) ? activitySpec(task.kind as ActivityKind) : { label: '' };
    const arrive = () => {
      if (token !== this.token) return;
      this.mode = 'task';
      this.seated = SEATED.has(task.kind);
      this.timer = task.duration;
      this.status = label || this.status;
      if (task.slot) this.face(task.slot.face.x, task.slot.face.y);
      if (task.standAtDesk) this.face(0, -1);
      if (task.line) this.say(this.world.line(task.line));
      if (task.partner) {
        const p = task.partner;
        this.time.delayedCall(1400, () => p.say(this.world.line('reply')));
      }
      if (task.door) {
        task.door.open();
        this.time.delayedCall(650, () => {
          if (token !== this.token) return;
          this.model.root.visible = false;
          this.shadow.visible = false;
          this.hideBubble();
        });
      }
      task.onArrive?.();
    };

    if (!task.slot) {
      // In place: at the desk (seated) or standing just behind the chair.
      if (task.standAtDesk) this.setPos(this.home.x, this.home.y + 0.55);
      arrive();
      return;
    }
    this.status = `Đang đi: ${(label || 'di chuyển').toLowerCase()}`;
    this.walkTo(task.slot.cell, task.slot.pos ?? cellCenter(task.slot.cell), arrive);
  }

  private walkTo(cell: Cell, final: Point, after: () => void): void {
    this.seated = false;
    const start = cellOf({ x: this.gx, y: this.gy });
    const cells = this.world.findPath(start, cell);
    if (!cells) {
      this.setPos(final.x, final.y);
      after();
      return;
    }
    this.path = [cellCenter(start), ...cells.slice(1).map(cellCenter), final];
    this.after = after;
    this.mode = 'walking';
    this.fallAfter = this.autonomous && cells.length > 6 && Math.random() < FALL_CHANCE ? rand(2, cells.length - 2) : Infinity;
  }

  private stepWalk(dt: number): void {
    let remaining = (WALK_SPEED * dt) / 1000;
    while (remaining > 0 && this.path.length) {
      const tgt = this.path[0];
      const dx = tgt.x - this.gx;
      const dy = tgt.y - this.gy;
      const d = Math.hypot(dx, dy);
      if (d > 0.02) this.face(dx, dy);
      const moved = Math.min(d, remaining);
      if (d <= remaining) {
        this.setPos(tgt.x, tgt.y);
        remaining -= d;
        this.path.shift();
      } else {
        this.setPos(this.gx + (dx / d) * remaining, this.gy + (dy / d) * remaining);
        remaining = 0;
      }
      this.fallAfter -= moved;
      if (this.fallAfter <= 0 && this.path.length) {
        this.fallAfter = Infinity;
        this.mode = 'falling';
        this.fallTimer = FALL_MS;
        this.say(this.world.line('fall'));
        return;
      }
    }
    if (!this.path.length) {
      this.mode = 'idle';
      const cb = this.after;
      this.after = null;
      cb?.();
    }
  }
}
