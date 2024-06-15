<template>
  <virtual-list
    class="log-list k-text-selectable"
    :data="logs" :count="300"
    :max-height="maxHeight"
    @top="onTop"
  >
    <template #="record">
      <div :class="{ line: true, start: isStart(record) }">
        <code v-html="renderLine(record)"></code>
        <router-link
          class="log-link inline-flex items-center justify-center absolute w-20px h-20px bottom-0 right-1"
          v-if="showLink && ctx.manager && record.meta?.paths?.length"
          :to="'/plugins/' + record.meta.paths[0].replace(/\./, '/')"
        >
          <k-icon name="arrow-right"/>
        </router-link>
      </div>
    </template>
  </virtual-list>
</template>

<script lang="ts" setup>

import { Dict, Time, VirtualList, useContext, useRpc, send } from '@cordisjs/client'
import {} from '@cordisjs/plugin-manager/client'
import Logger from 'reggol'
import AnsiUp from 'ansi_up'

const props = defineProps<{
  logs: Logger.Record[],
  showLink?: boolean,
  maxHeight?: string,
}>()

const ctx = useContext()
const data = useRpc<Dict<Logger.Record[] | null>>()

const converter = new AnsiUp()

function renderColor(code: number, value: any, decoration = '') {
  return `\u001b[3${code < 8 ? code : '8;5;' + code}${decoration}m${value}\u001b[0m`
}

const showTime = 'yyyy-MM-dd hh:mm:ss'

function isStart(record: Logger.Record & { index: number }) {
  return record.index && props.logs[record.index - 1].id > record.id
}

function renderLine(record: Logger.Record) {
  const prefix = `[${record.type[0].toUpperCase()}]`
  const space = ' '
  let indent = 3 + space.length, output = ''
  indent += showTime.length + space.length
  output += renderColor(8, Time.template(showTime, new Date(record.timestamp))) + space
  const code = Logger.code(record.name, { colors: 3 })
  const label = renderColor(code, record.name, ';1')
  const padLength = label.length - record.name.length
  output += prefix + space + label.padEnd(padLength) + space
  output += record.content.replace(/\n/g, '\n' + ' '.repeat(indent))
  return converter.ansi_to_html(output)
}

async function onTop() {
  const keys = Object.keys(data.value).filter(key => !data.value[key]).sort((a, b) => {
    return a.slice(0, 11).localeCompare(b.slice(0, 11)) || +a.slice(11) - +b.slice(11)
  }).reverse()
  if (!keys.length) return
  data.value[keys[0]] = await send('log.read', { name: keys[0] })
}

</script>

<style lang="scss" scoped>

.log-list {
  color: var(--terminal-fg);
  background-color: var(--terminal-bg);

  :deep(.el-scrollbar__view) {
    padding: 1rem 1rem;
  }

  .line.start {
    margin-top: 1rem;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: -0.5rem;
      border-top: 1px solid var(--terminal-separator);
    }
  }

  .line:first-child {
    margin-top: 0;

    &::before {
      display: none;
    }
  }

  .line {
    padding: 0 0.5rem;
    border-radius: 4px;
    font-size: 14px;
    line-height: 20px;
    white-space: pre-wrap;
    word-break: break-all;
    position: relative;

    &:hover {
      color: var(--terminal-fg-hover);
      background-color: var(--terminal-bg-hover);
    }

    ::selection {
      background-color: var(--terminal-bg-selection);
    }
  }
}

</style>