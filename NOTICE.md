# Deadwood Solo Open — notices

A solo, browser-only edition of **Deadwood — Last Light**.

- Upstream source: https://github.com/cedricbernadac/deadwood-open
- Upstream commit: 35ee1efed1bb448f9e2b6d66f7a6915e0e16bf90
- Solo development commit: 9739da6295c5905f9a85268222c1f12ce7e28bb3
- Code licence: MIT (see `LICENSE`; the upstream copyright notice is kept there).
- Media licence: Creative Commons Attribution 4.0 (CC BY 4.0; see `ASSETS-LICENSE.md`).

This export has no gameplay backend, account system or API keys: the whole
simulation runs locally in the browser. One map (the cabin), solo play.

## Run

Serve this directory with any static file server and open `index.html`:

    npx serve .
    python -m http.server 8000

During development, `node scripts/serve-solo.mjs` in the repository serves
`dist-solo/` at http://localhost:4173/.

## Three.js MIT licence

The MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
