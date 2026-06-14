// Multi-project scenario: the @language project (Node.ray) plus a dependent
// `app` project, to exercise dependency-closure / per-project ecosystem
// behavior. Run with: npx tsx src/tests.run.ts
import { Program, load_file, load_project } from './minimal.ts';

const cd = '@ether/$/.ray/v0';

const sources = [
  await load_file(`${cd}/.project.ray`),
  await load_file(`${cd}/Node.ray`),
  ...await load_project(`${cd}/tests/app`),
];

(await new Program(sources).abstract().run()).print();
