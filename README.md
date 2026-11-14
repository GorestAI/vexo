# Vexo gesture to speech

Wrist gestures on a Vexo Open band become spoken sentences. The band streams motion over
Bluetooth, the page learns your gestures from three examples each, and from then on every
gesture is written down and spoken out loud.

- **gesture-speak/**: connect, and the page teaches itself one gesture at a time (no buttons),
  then keeps listening. Gestures made in a row are joined into one sentence (OpenAI) and
  spoken (ElevenLabs; the browser's own voice if that does not answer).
- **shape-test/**: an experiment that measures whether the wrist alone can tell hand
  shapes apart (fist, flat hand, point). It reports a score against guessing.
- **gyro_rate.py**: measures how many gyroscope samples a second really arrive.
- **server.py**: serves the pages on `127.0.0.1` and keeps the keys on this computer
  (`/speak` and `/sentence`). Dot files such as `.env` are never served.
- **shared/**: page helpers copied from the kit (MIT).

## Run it

Needs Python 3.9 or newer and Chrome or Edge. Put the kit next to the pages:

    git clone https://github.com/VexoAI-Org/vexo-open-kit.git
    cp env.example .env        # fill in your keys; .env is never committed
    python3 server.py          # http://localhost:3000/gesture-speak/

No band? Open `http://localhost:3000/gesture-speak/?link=pretend`.

With a band: type its number, double-tap it so it blinks blue, press Connect. Only one
page or program can hold a band at a time, and connect only to your own band.

## What the band can and cannot sense

It feels how the wrist moves and tilts. It cannot see fingers, the other hand or a face,
so this is a personal gesture vocabulary, not a sign language translator.

Built on the [Vexo Open kit](https://github.com/VexoAI-Org/vexo-open-kit) (MIT).
