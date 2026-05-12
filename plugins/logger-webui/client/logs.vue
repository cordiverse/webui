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
        <div class="line">
          <code v-html="renderLine(message)"></code>
          <router-link
            v-if="showLink && getTarget(message)"
            class="log-link inline-flex items-center justify-center absolute w-20px h-20px bottom-0 right-1"
            :to="getTarget(message)!"
          >
            <k-icon name="arrow-right"/>
          </router-link>
        </div>
      </template>
    </virtual-list>
  </template>
  <template v-else>
    <slot name="empty">
      <div class="log-empty" v-bind="$attrs" :style="{ maxHeight, height: maxHeight }">
        <span>暂无日志</span>
      </div>
    </slot>
  </template>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import { Time, VirtualList, useContext, useRpc } from '@cordisjs/client'
import type {} from '@cordisjs/plugin-loader-webui/client'
import { AnsiUp } from 'ansi_up'
import type { Message } from 'cordis'
import type { Data } from '../src'

// Inlined from `Logger.code` to avoid bundling all of cordis core in the browser.
const c16 = [6, 2, 3, 4, 5, 1]
const c256 = [
  20, 21, 26, 27, 32, 33, 38, 39, 40, 41, 42, 43, 44, 45, 56, 57, 62,
  63, 68, 69, 74, 75, 76, 77, 78, 79, 80, 81, 92, 93, 98, 99, 112, 113,
  129, 134, 135, 148, 149, 160, 161, 162, 163, 164, 165, 166, 167, 168,
  169, 170, 171, 172, 173, 178, 179, 184, 185, 196, 197, 198, 199, 200,
  201, 202, 203, 204, 205, 206, 207, 208, 209, 214, 215, 220, 221,
]

function nameCode(name: string, level: number) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 3) - hash) + name.charCodeAt(i) + 13
    hash |= 0
  }
  const colors = level >= 2 ? c256 : c16
  return colors[Math.abs(hash) % colors.length]
}

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
const data = useRpc<Data>()
const history = ref<Message[]>([])
const exhausted = ref(false)

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
  const code = nameCode(message.name, 3)
  const label = renderColor(code, message.name, ';1')
  const padLength = label.length - message.name.length
  output += prefix + space + label.padEnd(padLength) + space
  output += message.body.replace(/\n/g, '\n' + ' '.repeat(indent))
  return converter.ansi_to_html(output)
}

const logs = computed(() => {
  const all = [...history.value, ...(data.value?.messages ?? [])]
  return all.filter(message => !props.filter || props.filter(message))
})

async function onTop() {
  if (!props.showHistory || exhausted.value) return
  const cursor = (history.value[0] ?? data.value?.messages?.[0])?.id
  if (!cursor) return
  const page = await data.value!.read({ before: cursor, limit: 500 })
  if (!page.length) {
    exhausted.value = true
    return
  }
  history.value = [...page, ...history.value]
}

function getTarget(message: Message): string | null {
  if (!message?.entryId) return null
  const manager = ctx.get('manager')
  if (!manager) return null
  const prefix = manager.prefix
  const local = prefix && message.entryId.startsWith(prefix)
    ? message.entryId.slice(prefix.length)
    : message.entryId
  if (!(local in manager.plugins.value.entries)) return null
  return '/plugins/' + local
}

</script>

<style lang="scss" scoped>

.log-list {
  color: var(--terminal-fg);
  background-color: var(--terminal-bg);

  :deep(.el-scrollbar__view) {
    padding: 1rem 1rem;
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

.log-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 8rem;
  color: var(--text-tertiary);
  background-color: var(--terminal-bg);
  font-size: 13px;
}

</style>
