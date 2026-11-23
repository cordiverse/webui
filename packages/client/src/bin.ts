#!/usr/bin/env node

import { cac } from 'cac'
import { resolve } from 'path'
import { build } from './index.ts'
import meta from '../package.json' with { type: 'json' }

const cli = cac('koishi-console').help().version(meta.version)

cli.command('build [root]')
  .action((root) => {
    root = resolve(process.cwd(), root || '.')
    build(root)
  })

cli.parse()

if (!cli.matchedCommand && !cli.options.help) {
  cli.outputHelp()
}
