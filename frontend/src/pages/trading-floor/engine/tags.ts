/** Keeps the name tags of a crowd readable: a tag that would cover another steps up above it. */

export interface TagBox {
  x: number
  y: number
  w: number
  h: number
}

const overlaps = (a: TagBox, b: TagBox): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * How far each tag is raised (world units, 0 = stays). `boxes` come front figure first: a tag keeps its
 * place against the ones after it, and each later tag climbs over whatever it would cover, at most
 * `maxSteps` times (in a tight crowd the last tags may still touch).
 */
export function liftTags(
  boxes: readonly TagBox[],
  gap: number,
  maxSteps: number
): number[] {
  const placed: TagBox[] = []
  return boxes.map((box) => {
    let lift = 0
    for (let step = 0; step < maxSteps; step++) {
      const at = { ...box, y: box.y - lift }
      const hit = placed.find((p) => overlaps(p, at))
      if (!hit) break
      lift = box.y + box.h - hit.y + gap
    }
    placed.push({ ...box, y: box.y - lift })
    return lift
  })
}
