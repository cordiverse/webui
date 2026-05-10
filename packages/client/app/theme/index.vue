<template>
  <activity-bar></activity-bar>
  <keep-alive>
    <component
      v-if="matched"
      :is="matched.component"
      :key="matched.path"
    ></component>
  </keep-alive>
  <not-found v-if="!matched && showNotFound"></not-found>
  <loading v-if="!matched && !showNotFound"></loading>
  <status-bar></status-bar>
  <menu-list></menu-list>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useContext, useRoute } from '@cordisjs/client'
import ActivityBar from './activity/index.vue'
import StatusBar from './status.vue'
import MenuList from './menu/index.vue'
import NotFound from './not-found.vue'
import Loading from './loading.vue'

const route = useRoute()
const ctx = useContext()

// Three-state route view, gated separately so `<keep-alive>` only wraps the
// matched component (Loading and NotFound have no state worth caching, and
// keeping them outside avoids same-key/different-component aliasing in the
// cache).
//
// `showNotFound` decides 404 vs Loading when the URL doesn't match a route:
// 1. If `loader.initialStatus === 404`, the server already determined no
//    entry's `routes` covers this URL — render 404 immediately, even if a
//    sibling entry's module is still importing or has stalled.
// 2. Otherwise wait for `loader.ready` (all known entries' modules done).
//    Then 404 is decisive. While `ready` is false we render Loading.
//
// A stuck/never-resolving entry will leave `ready === false` forever; (1)
// keeps unrelated bad URLs from being held hostage by it.
const matched = computed(() => route.matched[0])
const showNotFound = computed(() => {
  const loader = ctx.client.loader
  return loader.initialStatus === 404 || loader.ready.value
})

</script>
