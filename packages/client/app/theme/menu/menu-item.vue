<template>
  <div
    class="k-menu-item"
    v-if="!hidden"
    :class="[toValue(type), { disabled }]"
    @click.prevent="item?.action(ctx.$action.createScope())"
  >
    <span v-if="icon" class="k-menu-icon"><k-icon :name="icon"/></span>
    {{ toValue(label) }}
  </div>
</template>

<script lang="ts" setup>

import { MaybeGetter, MenuItem, useContext } from '@cordisjs/client'
import { computed } from 'vue'

const props = defineProps<MenuItem & { prefix: string }>()

const ctx = useContext()

const item = computed(() => {
  let id = props.id.replace(/^!/, '')
  if (id.startsWith('.')) id = props.prefix + id
  return ctx.internal.actions[id]
})

const hidden = computed(() => {
  if (!item.value) return true
  if (!item.value.hidden) return false
  return toValue(item.value.hidden)
})

const disabled = computed(() => {
  if (!item.value) return true
  if (!item.value.disabled) return false
  return toValue(item.value.disabled)
})

const icon = computed(() => toValue(props.icon))

function toValue<T>(getter: MaybeGetter<T>): T {
  if (typeof getter !== 'function') return getter
  return (getter as any)(ctx.$action.createScope())
}

</script>
