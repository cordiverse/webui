<template>
  <el-tooltip v-if="!hidden" :disabled="disabled" :content="toValue(item.label)" placement="bottom">
    <span class="menu-item" :class="[toValue(item.type), { disabled }]" @click="trigger">
      <k-icon class="menu-icon" :name="toValue(item.icon)"></k-icon>
    </span>
  </el-tooltip>
</template>

<script lang="ts" setup>

import { MaybeGetter, useContext } from '@cordisjs/client'
import { computed } from 'vue'

const props = defineProps<{
  item: any
  menuKey?: string
  menuData?: any
}>()

const ctx = useContext()

const hidden = computed(() => {
  if (!props.item.hidden) return false
  return toValue(props.item.hidden)
})

const disabled = computed(() => {
  if (!props.item.action) return true
  if (!props.item.disabled) return false
  return toValue(props.item.disabled)
})

const scope = computed(() => ctx.$action.createScope({
  [props.menuKey]: props.menuData,
}))

function toValue<T>(getter: MaybeGetter<T>): T {
  if (typeof getter !== 'function') return getter
  return (getter as any)(scope.value)
}

function trigger() {
  return props.item.action(scope.value)
}

</script>
