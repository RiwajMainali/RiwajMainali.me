// @ts-nocheck -- Runtime CommonJS harness deliberately mocks Next request/response streams.
// Run with the same Node major used to install better-sqlite3 (Node 22).
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (module, filename) => {
  const {outputText} = ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}});
  module._compile(outputText,filename);
};
require('../tests/gym.test.cjs');
