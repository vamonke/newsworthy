export const MODEL = 'reactor/visko-orbis-stable';

// These rules are also suitable for the eventual story model's system prompt.
export const COPY_RULES = `Write for someone choosing quickly on a phone.
Use common, everyday English. Write the way someone speaks.
Choice labels: start with a clear action verb and name what is acted on.
Aim for 2–5 words. Clarity matters more than the word limit.
Describe the player's immediate action, not its hoped-for result.
Avoid slogans, metaphors, idioms, vague verbs, and dramatic filler.
Only mention things already introduced or visible in the scene.
Keep the humour in what happens after the choice.
Check: can the player picture exactly what their character will do?
If a label has two meanings, rewrite it.
Examples: "Roll for freedom" → "Push the chair".
"Crawl to freedom" → "Crawl under the door".
"Deploy a distraction" → "Throw the bottle".`;

// Follow Reactor's dedicated Orbis prompt guide: establish the scene once,
// then describe one visible change per update in the same running session.
// https://docs.reactor.inc/model-api-reference/visko-orbis-stable/prompt-guide
export const REFERENCE = 'gym-follow-camera.png';
export const TEST_GOAL = 'WALK AND TURN · DOES THE CAMERA FOLLOW?';
export const beats = [
  {
    id: 'start', label: 'Start the gym', title: 'Take a look around.',
    line: 'Walk across the gym, then turn. The camera should move with you.',
    prompt: 'In this bright Animal Crossing-like gym, the orange-haired person in a teal T-shirt, navy shorts and white shoes stands holding a turquoise bottle, breathing gently. Sunlight enters through tall windows beside the treadmills, with padded benches and exercise equipment spaced around the open wooden floor. A third-person follow camera sits at shoulder height behind and slightly to the right of the person, keeping their back in the foreground and matching their position and direction as they move.',
  },
  {
    id: 'walk', label: 'Walk forward', title: 'A few steps forward.',
    line: 'Walk into the open floor. Watch whether the camera travels with you.',
    prompt: 'The person walks forward across the open floor at an easy pace. The camera tracks forward behind their right shoulder, keeping the same distance as the equipment passes along the sides of the frame.',
  },
  {
    id: 'turn', label: 'Turn right', title: 'Turn with the camera.',
    line: 'Turn to your right. The camera should swing behind you to show where you are facing.',
    prompt: 'The person turns ninety degrees to their right. The camera smoothly arcs around behind their right shoulder to match the turn, revealing the part of the gym they now face.',
  },
  {
    id: 'walk-again', label: 'Walk forward again', title: 'Keep going.',
    line: 'Walk in the new direction. Your character should stay in view.',
    prompt: 'The person walks forward in the direction they now face. The camera travels behind their right shoulder at a steady distance, with the room moving past them.',
  },
  {
    id: 'stand', label: 'Stop walking', title: 'Take a breath.',
    line: 'Stop where you are. The camera should settle behind you.',
    prompt: 'The person comes to a standstill with their feet planted on the floor. The following camera slows to rest behind their right shoulder.',
  },
  {
    id: 'cramp', label: 'Fake a cramp', title: '“Ow. My leg.”',
    line: 'Hold your leg. Watch whether the camera keeps the action visible.',
    prompt: 'The person bends down and grips their calf with their free hand. The camera eases back slightly and tilts down to keep their bent body and hand visible from behind.',
  },
];
