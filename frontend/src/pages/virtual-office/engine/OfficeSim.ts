import { activitySpec } from './config/activities';
import { GRID_H, GRID_W } from './config/constants';
import {
  AISLE_ROWS, BOSS_DESK, CHECK_IN, CONSULT_CLIENT_SEATS, DESK_COLS, DESK_ROWS, ELEVATOR, GLASS_X, GLASS_X_DOORS,
  GLASS_Y, MEETING_TABLE, RECEPTIONIST_CELL, RECEPTIONIST_SEAT, ROBOT_DOCK, SLOTS,
} from './config/layout';
import { LINES } from './config/lines';
import { BOSS, makeVisitor, RECEPTIONIST, STAFF } from './config/staff';
import { lightPool } from './objects/Decals';
import { Employee } from './objects/Employee';
import { createRobotVacuum, OfficeBuilder } from './objects/OfficeBuilder';
import { RobotVacuum } from './objects/RobotVacuum';
import { ScreenPool } from './objects/ScreenPool';
import { StockBoard } from './objects/StockBoard';
import { type Quality, World3D } from './render/World3D';
import type { ActivityKind, Cell, DoorLike, LineKind, MarketSnapshot, OfficeWorld, Period, PricePalette, SelectionInfo, Slot } from './types';
import { bakeStatic } from './utils/bake';
import { cellCenter, pick, rand } from './utils/helpers';
import { DAY, Market } from './utils/market';
import { SimClock } from './utils/simClock';
import { NavGrid } from './utils/pathfinding';

const MEETING_EVERY = 50000;
const VISITOR_EVERY = 30000;
const MAX_VISITORS = 2;
const QUALITIES: Quality[] = ['low', 'medium', 'high'];

export interface OfficeSimEvents {
  /** The clicked employee, or null when the selection is cleared. */
  onSelect(info: SelectionInfo | null): void;
  onQuality(quality: Quality): void;
  /** Fired on every simulated office minute step and whenever market data lands. */
  onTick(market: Market): void;
}

/** Simulation: drives the three.js office from a requestAnimationFrame loop and directs everyone in it. */
export class OfficeSim implements OfficeWorld {
  private readonly time = new SimClock();
  private readonly events: OfficeSimEvents;
  private frame = 0;
  private lastFrame = 0;
  private readonly onKey = (ev: KeyboardEvent) => {
    if (ev.key.toLowerCase() !== 'q' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const target = ev.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    this.cycleQuality();
  };
  private world3d!: World3D;
  private grid!: NavGrid;
  private market!: Market;
  private board!: StockBoard;
  private screens!: ScreenPool;
  private builder!: OfficeBuilder;
  private robot!: RobotVacuum;
  private employees: Employee[] = [];
  private staff: Employee[] = [];
  private visitors: Employee[] = [];
  private boss!: Employee;
  private receptionist!: Employee;
  private reserved = new Set<Slot>();
  private selected: Employee | null = null;
  private moodLevel = 0;
  private day = 0;
  private visitorCount = 0;
  elevator!: DoorLike;
  restroom!: DoorLike;

  constructor(host: HTMLElement, labelHost: HTMLElement, events: OfficeSimEvents) {
    this.events = events;
    this.world3d = new World3D(host, labelHost);
    this.grid = new NavGrid(GRID_W, GRID_H);
    this.market = new Market();
    this.screens = new ScreenPool(12);
    this.screens.primeAll(this.market);

    this.buildOffice();
    this.spawnStaff();
    this.setupPicking();
    this.setupQuality();

    this.board.redraw(this.market);
    this.world3d.setTimeOfDay(this.market.time);
    this.market.onTick((m) => this.onMarketTick(m));
    this.market.onData((m) => {
      this.board.redraw(m);
      this.screens.primeAll(m);
      this.events.onTick(m);
    });
    this.time.every(1000, () => this.market.tick());
    this.time.every(450, () => this.screens.step(this.market));
    this.time.every(MEETING_EVERY, () => this.callMeeting());
    this.time.every(VISITOR_EVERY, () => this.spawnVisitor());
    this.time.every(2500, () => this.matchConsultations());
    this.time.every(250, () => this.emitSelection());
    this.time.delayedCall(6000, () => this.spawnVisitor());
    this.events.onTick(this.market);

    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.loop);
    if (import.meta.env.DEV) (window as unknown as { __office: OfficeSim }).__office = this;
  }

  private readonly loop = (now: number): void => {
    this.frame = requestAnimationFrame(this.loop);
    // rAF stamps the frame start, which can precede the constructor's clock read.
    const dt = Math.max(0, Math.min(now - this.lastFrame, 100));
    this.lastFrame = Math.max(now, this.lastFrame);
    this.time.update(dt);
    for (const e of this.employees) e.update(dt);
    for (const a of this.builder.animated) a.update(dt / 1000);
    this.robot.update(dt / 1000);
    this.world3d.render();
  };

  /** Feeds real IQX market data into the board, the desk screens and the staff's mood. */
  setMarketData(snapshot: MarketSnapshot): void {
    this.market.setSnapshot(snapshot);
  }

  setPalette(palette: PricePalette): void {
    this.market.palette = palette;
    this.board.redraw(this.market);
    this.screens.primeAll(this.market);
  }

  /** Clears the employee selection (e.g. from the HUD close button). */
  clearSelection(): void {
    this.selected?.setSelected(false);
    this.selected = null;
    this.emitSelection();
  }

  setQuality(q: Quality): void {
    this.world3d.setQuality(q);
    this.events.onQuality(q);
  }

  cycleQuality(): void {
    this.setQuality(QUALITIES[(QUALITIES.indexOf(this.world3d.quality) + 1) % QUALITIES.length]);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.time.clear();
    window.removeEventListener('keydown', this.onKey);
    for (const e of this.employees) e.dispose();
    this.screens.dispose();
    this.world3d.dispose();
  }

  // ---------------------------------------------------------------- building

  private buildOffice(): void {
    const b = new OfficeBuilder(this.grid, this.screens);
    this.builder = b;
    b.floor();
    b.walls();

    b.bookcase(0, 1, 3);
    b.plant(0, 0, 'fig');
    b.plant(14, 0, 'snake');
    b.plant(21, 0, 'fig');
    b.plant(0, 15, 'bush');
    b.plant(14, 15, 'snake');
    b.plant(21, 7, 'bush');
    b.printer(13, 0);
    b.waterCooler(0, 8);
    b.fridge(0, 10);
    b.pantry(0, 11, 3);
    b.pantryTable(1.5, 14.5);
    b.pendant(1.5, 2.1, 14.5, true);

    b.glassColumn(GLASS_X, 0, 15, GLASS_X_DOORS);
    b.glassRow(GLASS_Y, GLASS_X + 1, 21);

    b.sofa(16.15, 0.1, 1.7);
    b.credenza(18.2, 0.05, 2.3);
    b.floorLamp(21.5, 3.5, true);
    b.bossDesk(BOSS_DESK.x, BOSS_DESK.y);
    b.chair(BOSS_DESK.x + 1, BOSS_DESK.y + 1.45, 0, 0x2b1c16, true);
    b.pendant(19, 2.2, 2.5, true);

    const meetingSeats = SLOTS.meeting.map((s) => ({ pos: cellCenter(s.cell), face: s.face }));
    b.meetingRoom(MEETING_TABLE.x, MEETING_TABLE.y, meetingSeats, 21.55, 11);
    b.pendant(17.8, 2.1, 11, true);
    b.pendant(19.2, 2.1, 11, false);

    let i = 0;
    for (const y of DESK_ROWS)
      for (const x of DESK_COLS) {
        b.desk(x, y, i++);
        b.chair(x + 1, y + 1.45);
      }

    // Expansion zones
    b.frontPartition();
    b.rightWall();
    b.lobby();
    b.lounge();
    b.phonePods();
    b.vipRoom();
    b.serverRoom();
    b.quietNook();
    b.cafeteria();

    const scene = this.world3d.scene;
    scene.add(bakeStatic(b.staticRoot), b.dynamicRoot);
    for (const g of b.glowSpots) scene.add(lightPool(g.x, g.z, g.r, g.color, 0.14));
    for (const y of DESK_ROWS) for (const x of [4, 8, 12]) scene.add(lightPool(x, y + 1.2, 1.9, 0xfff1dc, 0.05));
    this.world3d.refreshShadows();

    this.board = new StockBoard(2.3, 12.7, 0.95, 3.0);
    scene.add(this.board.group);

    this.elevator = this.debouncedDoor(b.elevator);
    this.restroom = this.debouncedDoor(b.restroom);

    const robotMesh = createRobotVacuum();
    scene.add(robotMesh);
    this.robot = new RobotVacuum(robotMesh, this.grid, ROBOT_DOCK);
  }

  /** Opening a door keeps it open while people pass, then closes it automatically. */
  private debouncedDoor(door: DoorLike): DoorLike {
    let token = 0;
    return {
      open: () => {
        door.open();
        const t = ++token;
        this.time.delayedCall(2200, () => t === token && door.close());
      },
      close: () => door.close(),
    };
  }

  private spawnStaff(): void {
    let i = 0;
    for (const y of DESK_ROWS)
      for (const x of DESK_COLS) {
        const profile = STAFF[i++ % STAFF.length];
        this.staff.push(new Employee(this, this.time, profile, { x: x + 1, y: y + 1.45 }, { x: x + 1, y: y + 1 }));
      }
    this.boss = new Employee(
      this, this.time, BOSS,
      { x: BOSS_DESK.x + 1, y: BOSS_DESK.y + 1.45 },
      { x: BOSS_DESK.x + 1, y: BOSS_DESK.y + 1 },
    );
    this.receptionist = new Employee(this, this.time, RECEPTIONIST, RECEPTIONIST_SEAT, RECEPTIONIST_CELL);
    this.staff.push(this.boss, this.receptionist);
    this.employees.push(...this.staff);
    for (const e of this.staff) this.world3d.scene.add(...e.objects);
    this.scheduleDay();
  }

  // ---------------------------------------------------------------- input

  private setupPicking(): void {
    const el = this.world3d.renderer.domElement;
    let down = { x: 0, y: 0 };
    el.addEventListener('pointerdown', (ev) => (down = { x: ev.clientX, y: ev.clientY }));
    el.addEventListener('pointerup', (ev) => {
      if (ev.button !== 0 || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
      const visible = this.employees.filter((e) => !e.isAway).map((e) => e.model.root);
      const hit = this.world3d.pick(ev.clientX, ev.clientY, visible);
      const emp = (hit?.userData.employee as Employee | undefined) ?? null;
      this.selected?.setSelected(false);
      this.selected = emp;
      this.selected?.setSelected(true);
      this.emitSelection();
    });
  }

  private setupQuality(): void {
    this.setQuality('medium');
    window.addEventListener('keydown', this.onKey);
  }

  private emitSelection(): void {
    const e = this.selected;
    if (e?.isAway) {
      e.setSelected(false);
      this.selected = null;
    }
    const s = this.selected;
    const info: SelectionInfo | null = s
      ? { name: s.profile.name, role: s.profile.title, status: s.status, color: s.profile.shirt }
      : null;
    this.events.onSelect(info);
  }

  // ---------------------------------------------------------------- day cycle

  /** Assigns today's arrival / departure times. */
  private scheduleDay(): void {
    for (const e of this.staff) {
      e.arriveAt = e === this.receptionist ? DAY.start + 5 : e === this.boss ? rand(8 * 60 + 15, 8 * 60 + 50) : rand(DAY.start, DAY.open - 6);
      e.leaveAt = e === this.boss ? DAY.night - 6 : e === this.receptionist ? DAY.leave + 20 : rand(DAY.leave, DAY.night - 12);
    }
  }

  private onMarketTick(m: Market): void {
    this.board.redraw(m);
    this.events.onTick(m);
    this.world3d.setTimeOfDay(m.time);
    this.robot.night = m.time >= DAY.night;

    if (m.day !== this.day) {
      if (this.day !== 0) {
        for (const v of [...this.visitors]) this.despawn(v);
        this.scheduleDay();
      }
      this.day = m.day;
    }
    for (const e of this.staff) {
      if (e.isAway && m.time >= e.arriveAt && m.time < e.leaveAt) e.arrive();
      else if (!e.isAway && m.time >= e.leaveAt && e.currentKind !== 'meeting' && e.currentKind !== 'consult') e.leave();
    }

    const level = Math.trunc(m.indexPct / 0.5);
    if (level !== this.moodLevel && m.trading) {
      const up = level > this.moodLevel;
      this.moodLevel = level;
      const working = this.staff.filter((e) => e.available && e !== this.boss);
      for (let i = 0; i < 4 && working.length; i++) {
        const e = working.splice(Math.floor(Math.random() * working.length), 1)[0];
        const kind = up ? (Math.abs(m.indexPct) >= 1 && Math.random() < 0.5 ? 'dance' : 'cheer') : 'stress';
        this.time.delayedCall(rand(0, 1500), () => e.react(kind));
      }
    }
  }

  private callMeeting(): void {
    if (!this.market.trading || this.boss.isAway || !this.boss.available) return;
    if (this.employees.some((e) => e.currentKind === 'meeting')) return;
    const free = SLOTS.meeting.filter((s) => !this.reserved.has(s));
    const staff = this.staff.filter((e) => e.available && e.profile.role === 'staff');
    const n = Math.min(free.length - 1, staff.length, 4 + Math.floor(Math.random() * 3));
    if (n < 2) return;
    const duration = rand(...activitySpec('meeting').duration);
    const attendees = [this.boss, ...staff.sort(() => Math.random() - 0.5).slice(0, n)];
    attendees.forEach((e, i) => {
      const slot = free[i];
      this.reserved.add(slot);
      this.time.delayedCall(i * 300, () =>
        e.run({ kind: 'meeting', slot, duration, reserved: true, line: i === 0 ? 'meeting' : null }),
      );
    });
  }

  // ---------------------------------------------------------------- visitors

  private spawnVisitor(): void {
    const t = this.market.time;
    if (t < DAY.open || t > DAY.leave - 20 || this.visitors.length >= MAX_VISITORS || this.receptionist.isAway) return;
    const wait = this.reserveSlot('wait');
    if (!wait) return;
    const v = new Employee(this, this.time, makeVisitor(this.visitorCount++), cellCenter(ELEVATOR.cell), ELEVATOR.cell, false);
    this.visitors.push(v);
    this.employees.push(v);
    this.world3d.scene.add(...v.objects);
    v.arrive(() =>
      v.run({
        kind: 'greet',
        slot: CHECK_IN,
        duration: 2600,
        line: null,
        onArrive: () => {
          v.say(this.line('visitor'));
          this.time.delayedCall(1200, () => !this.receptionist.isAway && this.receptionist.say(this.line('greet')));
        },
        then: {
          kind: 'wait',
          slot: wait,
          reserved: true,
          duration: 70000,
          line: 'wait',
          onDone: () => v.leave(() => this.despawn(v)),
        },
      }),
    );
  }

  /** Pairs a waiting client with a free broker at a free VIP table. */
  private matchConsultations(): void {
    const waiting = this.visitors.find((v) => v.currentKind === 'wait' && v.status === activitySpec('wait').label);
    if (!waiting) return;
    const i = SLOTS.consult.findIndex((s, k) => !this.reserved.has(s) && !this.reserved.has(CONSULT_CLIENT_SEATS[k]));
    if (i < 0) return;
    const broker = this.staff.find((e) => e.available && e.profile.role === 'staff' && Math.random() < 0.5);
    if (!broker) return;
    const seat = SLOTS.consult[i];
    const clientSeat = CONSULT_CLIENT_SEATS[i];
    this.reserved.add(seat);
    this.reserved.add(clientSeat);
    const duration = rand(...activitySpec('consult').duration);
    broker.say('Mời anh/chị qua phòng VIP ạ');
    broker.run({ kind: 'consult', slot: seat, reserved: true, duration, line: 'consult' });
    waiting.run({
      kind: 'consult',
      slot: clientSeat,
      reserved: true,
      duration: duration + 1500,
      line: null,
      onDone: () => {
        waiting.say('Cảm ơn em, tư vấn rất hay!');
        waiting.leave(() => this.despawn(waiting));
      },
    });
  }

  private despawn(v: Employee): void {
    for (const o of v.objects) o.removeFromParent();
    v.dispose();
    this.visitors = this.visitors.filter((x) => x !== v);
    this.employees = this.employees.filter((x) => x !== v);
    if (this.selected === v) this.selected = null;
  }

  // ---------------------------------------------------------------- OfficeWorld

  findPath(from: Cell, to: Cell): Cell[] | null {
    return this.grid.findPath(from, to);
  }

  reserveSlot(kind: ActivityKind): Slot | null {
    if (!(kind in SLOTS)) return null;
    if (kind === 'spectate' && !SLOTS.pingpong.some((s) => this.reserved.has(s))) return null;
    const free = SLOTS[kind as keyof typeof SLOTS].filter((s) => !this.reserved.has(s));
    if (!free.length) return null;
    const slot = pick(free);
    this.reserved.add(slot);
    return slot;
  }

  releaseSlot(slot: Slot): void {
    this.reserved.delete(slot);
  }

  private colleague(self: Employee): Employee | null {
    const c = this.staff.filter((e) => e !== self && e.available && (e.profile.role === 'staff' || e.profile.role === 'it'));
    return c.length ? pick(c) : null;
  }

  pickChatTarget(self: Employee): { slot: Slot; target: Employee } | null {
    const target = this.colleague(self);
    if (!target) return null;
    const cell = { x: target.homeCell.x, y: target.homeCell.y + 1 };
    if (!this.grid.isWalkable(cell.x, cell.y)) return null;
    return { target, slot: { cell, face: { x: target.home.x - (cell.x + 0.5), y: target.home.y - (cell.y + 0.5) } } };
  }

  pickPatrolSlot(): Slot {
    for (;;) {
      const cell = { x: 1 + Math.floor(Math.random() * (GRID_W - 2)), y: pick(AISLE_ROWS) };
      if (this.grid.isWalkable(cell.x, cell.y)) return { cell, face: { x: 0, y: -1 } };
    }
  }

  pickPair(kind: ActivityKind, self: Employee): { mine: Slot; theirs: Slot; partner: Employee } | null {
    if (!(kind in SLOTS)) return null;
    const slots = SLOTS[kind as keyof typeof SLOTS];
    if (slots.length < 2 || slots.some((s) => this.reserved.has(s))) return null;
    const partner = this.colleague(self);
    if (!partner) return null;
    this.reserved.add(slots[0]);
    this.reserved.add(slots[1]);
    return { mine: slots[0], theirs: slots[1], partner };
  }

  pickConfrontation(self: Employee): { mine: Slot; theirs: Slot; partner: Employee } | null {
    const partner = this.colleague(self);
    if (!partner || partner.profile.role !== 'staff') return null;
    const { x, y } = partner.homeCell;
    const a = { x, y: y + 1 };
    const b = { x: x + 1, y: y + 1 };
    if (!this.grid.isWalkable(a.x, a.y) || !this.grid.isWalkable(b.x, b.y)) return null;
    return { partner, mine: { cell: a, face: { x: 1, y: 0 } }, theirs: { cell: b, face: { x: -1, y: 0 } } };
  }

  bossDistance(e: Employee): number {
    if (this.boss.isAway) return Infinity;
    return Math.hypot(this.boss.gx - e.gx, this.boss.gy - e.gy);
  }

  callBoss(at: Slot): void {
    if (this.boss.isAway || this.boss.currentKind === 'meeting' || this.boss.currentKind === 'consult') return;
    const cands = [
      { x: at.cell.x, y: at.cell.y + 1 },
      { x: at.cell.x, y: at.cell.y - 1 },
      { x: at.cell.x - 1, y: at.cell.y },
    ];
    const cell = cands.find((c) => this.grid.isWalkable(c.x, c.y));
    if (!cell) return;
    this.boss.run({
      kind: 'patrol',
      slot: { cell, face: { x: at.cell.x + 0.5 - (cell.x + 0.5), y: at.cell.y + 0.5 - (cell.y + 0.5) } },
      duration: 4000,
      line: 'breakup',
    });
  }

  line(kind: LineKind): string {
    if (kind === 'board') {
      const p = this.market.indexPct;
      if (p > 0.5) return pick(LINES.bull);
      if (p < -0.5) return pick(LINES.bear);
    }
    return pick(LINES[kind]);
  }

  period(): Period {
    if (this.market.isLunch) return 'lunch';
    return this.market.time < DAY.close ? 'trading' : 'after';
  }

  isLunch(): boolean {
    return this.market.isLunch;
  }
}
