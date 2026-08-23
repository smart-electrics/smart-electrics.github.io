# Design reference: AI Home Control Platform

Primary reference supplied by the owner:
[AI Home Control Platform on Dribbble](https://dribbble.com/shots/27651031-AI-Home-Control-Platform).
The motion source inspected for implementation is the
[7.53-second MP4](https://cdn.dribbble.com/userupload/48726055/file/2cb7b81475761199cd61ed6f172f85e9.mp4)
at 2886×2160 and 30 fps.

## What is intentionally carried forward

- one fluid, framed stage on a deep OLED-like background;
- very large, light-weight typography that shares space with one dominant
  photorealistic object;
- warm translucent labels that explain the system without hiding the scene;
- navigation that exposes the service model instead of hiding it;
- automation explained through understandable controls and scenario states;
- layered depth, warm light and deliberate overlap as part of a maximalist
  luxury composition.

## Site-wide motion target

Cinematic assemble/disassemble is the target interaction principle for the
whole site, not an effect reserved for the smart-home route. Issue #20 creates
the reference implementation on the smart-home route; Issue #21 owns the
route-by-route rollout across the rest of the public site. Acceptance of the
smart-home slice does not claim that rollout is already complete. Interactive
compositions move through three meaningful states:

- `assembled`: the complete engineering composition and its relationships are
  visible;
- `focus`: secondary interface layers recede so one scene, zone, circuit or
  engineering relationship becomes primary;
- `reassembled`: the selected scenario, service, solution or process stage is
  rebuilt around that primary element.

The reference video creates its effect by moving from a complete control
composition to a clean architectural close-up and then rebuilding masked
typography, a central control layer, callouts and connectors around the scene.
Smart Electrics carries forward that orchestration quality. Motion must expose
causality such as event → route → zone → system → result, or input → protection
→ distribution → priority group. It must never be movement without a domain
reason.

Every control that looks interactive must change a meaningful local
demonstration state. Pointer, keyboard and touch receive the same state model;
no-JavaScript output preserves the complete reading order; reduced-motion
output preserves every state without animation. Decorative `01 / 02 / …`
labels are not part of the visual language.

The same contract applies to navigation, the homepage, service and solution
catalogues and details, smart-home scenarios, process, about and related-route
transitions. Each engineering direction gets its own model: panel protection
flow, low-voltage topology, camera coverage, climate zones, audio routing,
lighting scenes, backup priorities or diagnostic isolation.

The public Dribbble page identifies this palette: `#040201`, `#59372A`,
`#F6A45F`, `#F3E6E4`, `#AF5D38`, `#817D83`, and `#D0B49C`. Smart Electrics
uses those values as a starting point for its own electrical-engineering
interface, with independent layouts, components and media.

## What is not copied

No source code, imagery, logo, typography asset, screen arrangement or branded
wording from the Dribbble work is included. Smart Electrics does not copy its
AI positioning, review counter, dashboard claims or inert control UI. The site
replaces them with architectural scenes, real local interactions, verified
business scope and vendor-neutral explanations. Visual review compares motion
orchestration, hierarchy, depth and clarity rather than reconstructing the
reference pixel for pixel.
