# Contributing

Thanks for helping with Team Minimap. Anyone can send a pull request, and you don't need to ask first for small fixes. For a bigger change or a new feature, open an issue first so we can agree on it before you spend time on it.

## Send a pull request

1. Fork the repository on GitHub, then clone your fork.
2. Make a branch from `main`:

   ```bash
   git checkout -b my-change
   ```

3. Install the dependencies (you need [Node.js](https://nodejs.org) 24 or newer):

   ```bash
   npm install
   ```

4. Make your change, and see it working (see [Develop](README.md#develop)).
5. Run the same checks CI runs, and make sure all three pass:

   ```bash
   npm run typecheck
   ```

   ```bash
   npm test
   ```

   ```bash
   npm run build
   ```

6. Push the branch to your fork and open a pull request against `main`. Fill in the template.

If this is your first pull request here, a maintainer has to approve CI before it runs, so the checks may wait a little.

## How we write code

[AGENTS.md](AGENTS.md) holds the house rules and a map from each feature to its code. Read it before a big change. In short:

- Keep the change small, and don't add a dependency when a few lines will do.
- Check every value from a request on the server. Never trust the browser.
- Logic that doesn't touch React, the DOM or three.js goes in `src/lib/` or `shared/`, with a `*.test.ts` next to it.
- Keep the 2D and 3D maps in step.
- A new feature gets its own page and its own API module and data file. `server/basketball/` is the example to copy.
- Update `README.md` when what people do or set up changes.

## Security problems

Please don't open a public issue or pull request for a security problem. Use GitHub's **Report a vulnerability** button on the repository's **Security** tab instead.
