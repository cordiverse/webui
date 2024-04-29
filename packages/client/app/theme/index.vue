<template>
  <activity-bar></activity-bar>
  <router-view #="{ Component }">
    <keep-alive>
      <component :is="Component"></component>
    </keep-alive>
  </router-view>
  <status-bar></status-bar>
  <menu-list></menu-list>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ActivityBar from './activity/index.vue'
import StatusBar from './status.vue'
import MenuList from './menu/index.vue'

const route = useRoute()

</script>
