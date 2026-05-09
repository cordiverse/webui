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
import { Logger, Message } from 'reggol'
import type { Data } from '../src'

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
  const code = Logger.code(message.name, 3)
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
