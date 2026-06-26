import { useEffect, type RefObject } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

const viFmt = (decimals: number) =>
  new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

/**
 * All landing-page motion lives here, scoped to the page root and wrapped in
 * gsap.matchMedia() so `prefers-reduced-motion` and small screens get stripped
 * variants. Everything is reverted on unmount via the gsap context.
 *
 * DOM contract:
 *  - `.lp-reveal`            → batch fade-up on scroll
 *  - `[data-countup]`        → number tween (data-decimals/-prefix/-suffix)
 *  - `.lp-tape`              → hairline draw-in
 *  - `[data-pin]`            → the single pinned scrolly; contains
 *      `[data-beat]` text rows + `[data-fig]` stacked figures (same count)
 */
export function useLandingGsap(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()

      // ── full motion ──
      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          desktop: "(min-width: 880px)",
        },
        (context) => {
          const conditions = context.conditions as { motion: boolean; desktop: boolean }
          if (!conditions.motion) return
          root.classList.add("lp-js")

          // reveal batch
          ScrollTrigger.batch(".lp-reveal", {
            start: "top 90%",
            onEnter: (els) =>
              gsap.to(els, {
                opacity: 1,
                y: 0,
                duration: 0.7,
                ease: "power3.out",
                stagger: 0.07,
                overwrite: true,
              }),
          })

          // count-ups
          root.querySelectorAll<HTMLElement>("[data-countup]").forEach((el) => {
            const target = parseFloat(el.dataset.countup || "0")
            const decimals = parseInt(el.dataset.decimals || "0", 10)
            const prefix = el.dataset.prefix || ""
            const suffix = el.dataset.suffix || ""
            const fmt = viFmt(decimals)
            const obj = { v: 0 }
            el.textContent = prefix + fmt.format(0) + suffix
            ScrollTrigger.create({
              trigger: el,
              start: "top 92%",
              once: true,
              onEnter: () =>
                gsap.to(obj, {
                  v: target,
                  duration: 1.5,
                  ease: "power2.out",
                  onUpdate: () => {
                    el.textContent = prefix + fmt.format(obj.v) + suffix
                  },
                }),
            })
          })

          // tape dividers draw-in
          root.querySelectorAll<HTMLElement>(".lp-tape").forEach((el) => {
            gsap.fromTo(
              el,
              { scaleX: 0, transformOrigin: "left center" },
              {
                scaleX: 1,
                ease: "none",
                scrollTrigger: { trigger: el, start: "top 96%", end: "top 70%", scrub: true },
              },
            )
          })

          // ── single pinned scrolly (desktop only) ──
          const pin = root.querySelector<HTMLElement>("[data-pin]")
          if (pin && conditions.desktop) {
            const beats = gsap.utils.toArray<HTMLElement>("[data-beat]", pin)
            const figs = gsap.utils.toArray<HTMLElement>("[data-fig]", pin)
            const setActive = (idx: number) => {
              beats.forEach((b, i) => b.classList.toggle("is-active", i === idx))
              figs.forEach((f, i) => f.classList.toggle("is-active", i === idx))
            }
            setActive(0)
            const steps = Math.max(beats.length, 1)
            ScrollTrigger.create({
              trigger: pin,
              start: "top top",
              end: "+=" + steps * 80 + "%",
              pin: true,
              pinSpacing: true,
              scrub: 0.4,
              onUpdate: (self) => {
                const idx = Math.min(steps - 1, Math.floor(self.progress * steps))
                setActive(idx)
              },
            })
          }

          ScrollTrigger.refresh()
        },
      )

      // ── reduced motion: ensure everything is visible (no .lp-js reveal hiding) ──
      mm.add("(prefers-reduced-motion: reduce)", () => {
        root.classList.remove("lp-js")
      })
    }, rootRef)

    return () => ctx.revert()
  }, [rootRef])
}
