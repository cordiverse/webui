<template>
  <k-content v-if="currentEntry">
    <k-markdown :source="content"/>
  </k-content>
</template>

<script lang="ts" setup>

import { computed, ref, watch } from 'vue'
import { useRouter } from '@cordisjs/client'
import { send, useContext, useRpc } from '@cordisjs/client'
import { Data } from '../../src'

const ctx = useContext()
const router = useRouter()
const data = useRpc<Data>()

// FIXME locale with fallback
const locale = ref('')

const currentEntry = computed(() => ctx.manager.currentEntry!)
const readme = computed(() => data.value.packages[currentEntry.value.name]?.readme)

const content = computed(() => {
  if (!readme.value) return undefined
  return readme.value[locale.value]
})

watch(content, (value) => {
  // use `null` to trigger watcher
  if (value || value === undefined) return
  send('manager.package.readme', {
    name: currentEntry.value.name,
    locale: locale.value,
  })
}, { immediate: true })

</script>
