<template>
  <ul class="effect-list">
    <li v-for="effect in effects">
      {{ effect.label }}
      <effect-tree v-if="effect.children.length" :effects="effect.children"/>
    </li>
  </ul>
</template>

<script lang="ts" setup>

import { EffectMeta } from 'cordis'

defineProps<{
  effects: EffectMeta[]
}>()

</script>

<style lang="scss" scoped>

li > ul.effect-list {
  margin-top: 0;
  margin-bottom: 0;
}

</style>
