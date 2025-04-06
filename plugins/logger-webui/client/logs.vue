<template>
  <template v-if="logs.length">
    <slot name="header"></slot>
    <virtual-list
      class="log-list k-text-selectable"
      v-bind="$attrs"
      :data="logs" :count="300"
      :max-height="maxHeight"
      @top="onTop"
    >
      <template #="message">
        <div :class="{ line: true, start: message.start }">
          <code v-html="renderLine(message)"></code>
          <router-link
            class="log-link inline-flex items-center justify-center absolute w-20px h-20px bottom-0 right-1"
            v-if="showLink && ctx.get('manager') && message?.entryId"
            :to="'/plugins/' + message.entryId"
          >
            <k-icon name="arrow-right"/>
          </router-link>
        </div>
      </template>
    </virtual-list>
  </template>
  <template v-else>
    <slot name="empty"></slot>
  </template>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { Dict, Time, VirtualList, useContext, useRpc, send } from '@cordisjs/client'
import type {} from '@cordisjs/plugin-manager/client'
import { AnsiUp } from 'ansi_up'
import { Logger, Message } from 'reggol'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  filter?: (message: Message) => boolean,
  showHistory?: boolean,
  showLink?: boolean,
  maxHeight?: string,
}>()

const ctx = useContext()
const data = useRpc<Dict<Message[] | null>>()

const converter = new AnsiUp()

function renderColor(code: number, value: any, decoration = '') {
  return `\u001b[3${code < 8 ? code : '8;5;' + code}${decoration}m${value}\u001b[0m`
}

const showTime = 'yyyy-MM-dd hh:mm:ss'

function renderLine(message: Message) {
  const prefix = `[${message.type[0].toUpperCase()}]`
  const space = ' '
  let indent = 3 + space.length, output = ''
  indent += showTime.length + space.length
  output += renderColor(8, Time.template(showTime, new Date(message.ts))) + space
  const code = Logger.code(message.name, 3)
  const label = renderColor(code, message.name, ';1')
  const padLength = label.length - message.name.length
  output += prefix + space + label.padEnd(padLength) + space
  output += message.body.replace(/\n/g, '\n' + ' '.repeat(indent))
  return converter.ansi_to_html(output)
}

const logs = computed(() => {
  const keys = Object.keys(data.value).filter(key => data.value[key]).sort((a, b) => {
    return a.slice(0, 11).localeCompare(b.slice(0, 11)) || +a.slice(11) - +b.slice(11)
  }).reverse()
  const result: (Message & { start?: boolean })[] = []
  for (const key of keys) {
    const curr = data.value[key]!
    if (result.length && curr[curr.length - 1].sn > result[0].sn) {
      if (!props.showHistory) break
      result[0].start = true
    }
    result.unshift(...data.value[key]!
      .filter(message => !props.filter || props.filter(message))
      .map(message => ({ ...message })))
  }
  return result
})

async function onTop() {
  if (!props.showHistory) return
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
