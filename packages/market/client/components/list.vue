<template>
  <slot name="header" v-bind="{ all, packages, hasFilter: hasFilter(modelValue) }"></slot>
  <template v-if="packages.length">
    <div class="package-list">
      <market-package
        v-for="data in pages[page - 1]"
        :key="data.package.name"
        class="k-card"
        :data="data"
        :gravatar="gravatar"
        @query="onQuery"
        #action
      >
        <slot name="action" v-bind="data"></slot>
      </market-package>
    </div>
  </template>
  <k-empty v-else>
    没有搜索到相关插件。
  </k-empty>
</template>

<script lang="ts" setup>

import { computed, inject, ref, watch } from 'vue'
import { SearchObject } from '@cordisjs/registry'
import { getSorted, getFiltered, hasFilter, kConfig } from '../utils'
import MarketPackage from './package.vue'

const props = defineProps<{
  modelValue: string[],
  data: SearchObject[],
  installed?: (data: SearchObject) => boolean,
  gravatar?: string,
  page?: number,
}>()

const emit = defineEmits(['update:modelValue', 'update:page'])

const config = inject(kConfig, {})

const all = computed(() => getSorted(props.data, props.modelValue))

const packages = computed(() => getFiltered(all.value, props.modelValue, config))

const limit = computed(() => {
  for (const word of props.modelValue) {
    if (word.startsWith('limit:')) {
      const size = parseInt(word.slice(6))
      if (size) return size
    }
  }
  return 24
})

const internalPage = ref(1)
const page = computed({
  get: () => props.page ?? internalPage.value,
  set: (v) => {
    internalPage.value = v
    emit('update:page', v)
  },
})

// Reset to page 1 when search/filter changes (total may shrink below current page)
watch(() => packages.value.length, () => {
  if (page.value > pages.value.length) page.value = 1
})

const pages = computed(() => {
  const result: SearchObject[][] = []
  for (let i = 0; i < packages.value.length; i += limit.value) {
    result.push(packages.value.slice(i, i + limit.value))
  }
  return result
})

defineExpose({
  total: computed(() => packages.value.length),
  limit,
})

function onQuery(word: string) {
  const words = props.modelValue.slice()
  if (!words[words.length - 1]) words.pop()
  if (!words.includes(word)) words.push(word)
  words.push('')
  emit('update:modelValue', words)
}

</script>

<style lang="scss" scoped>

.package-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(336px, 1fr));
  gap: var(--card-margin);
  justify-items: center;
}

.k-empty {
  flex: 1 0 auto;
}

</style>
