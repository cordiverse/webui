<template>
  <activity-bar></activity-bar>
  <keep-alive>
    <component :is="component" :key="route.matched[0]?.path"></component>
  </keep-alive>
  <status-bar></status-bar>
  <menu-list></menu-list>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useRoute } from '@cordisjs/client'
import ActivityBar from './activity/index.vue'
import StatusBar from './status.vue'
import MenuList from './menu/index.vue'

const route = useRoute()
const component = computed(() => route.matched[0]?.component)

</script>
