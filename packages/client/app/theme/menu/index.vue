<template>
  <template v-for="menu of ctx.client.action.activeMenus" :key="menu.id">
    <k-menu v-bind="menu"></k-menu>
  </template>
</template>

<script lang="ts" setup>

import { useContext } from '@cordisjs/client'
import { useEventListener } from '@vueuse/core'
import KMenu from './menu.vue'

const ctx = useContext()

useEventListener('click', () => {
  ctx.client.action.activeMenus.splice(0)
})

useEventListener('contextmenu', () => {
  ctx.client.action.activeMenus.splice(0)
})

</script>
