<template>
</template>

<script lang="ts" setup>

import { computed } from 'vue'

const props = defineProps<{
  modelValue: any
}>()

const emit = defineEmits(['update:modelValue'])

const config = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

</script>

<style lang="scss" scoped>

h2 {
  font-size: 1.25rem;
}

</style>
