<template>
  <el-dialog
    :modelValue="ctx.manager.dialogSelect !== undefined"
    @update:modelValue="ctx.manager.dialogSelect = undefined"
    class="plugin-select"
    @open="handleOpen"
  >
    <template #header>
      <slot name="title" :packages="packages">
        <span class="title">选择插件</span>
      </slot>
      <el-input ref="inputEl" v-model="keyword" #suffix>
        <k-icon name="search"></k-icon>
      </el-input>
    </template>
    <slot name="tabs" :packages="packages"></slot>
    <div class="content">
      <el-scrollbar>
        <template v-for="local in packages" :key="local.package.name">
          <div
            class="package text-base px-4 py-2 cursor-pointer transition"
            @click.stop="configure(local.package.name)">
            <div class="font-bold mb-1">{{ local.package.name }}</div>
            <k-markdown inline class="desc" :source="tt(local.manifest.description)"></k-markdown>
          </div>
        </template>
      </el-scrollbar>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>

import { router, send, useContext, useI18nText } from '@cordisjs/client'
import { computed, nextTick, ref, watch } from 'vue'
import { useAutoFocus } from '../utils'

const ctx = useContext()
const tt = useI18nText()

const keyword = ref('')
const inputEl = ref()

const handleOpen = useAutoFocus(inputEl)

const packages = computed(() => Object.values(ctx.manager.data.value.packages).filter((local) => {
  return local.package.name.includes(keyword.value.toLowerCase())
}))

function joinName(name: string, base: string) {
  if (name.startsWith('./')) name = name.slice(2)
  return base + '/' + name
}

async function configure(name: string) {
  const parent = ctx.manager.dialogSelect
  ctx.manager.dialogSelect = undefined
  keyword.value = ''
  const id = await send('manager.config.create', {
    name,
    parent,
    disabled: true,
  })
  router.push('/plugins/' + id)
}

</script>

<style lang="scss">

.plugin-select {
  padding: 0;

  .el-dialog__header {
    margin-right: 0;
    padding: 12px 20px;
    border-bottom: 1px solid var(--k-color-divider);
    display: flex;
    align-items: center;
    justify-content: space-between;

    button {
      top: 2px;
    }

    .title {
      flex: 0 0 auto;
    }

    .el-input {
      display: inline-block;
      width: 220px;
      height: 2rem;
    }
  }

  .el-dialog__body {
    display: flex;
    padding: 0;
    height: 50vh;

    .tabs {
      width: 7.5rem;
      border-right: 1px solid var(--k-color-divider);
      font-size: 15px;
      flex: 0 0 auto;

      @media screen and (max-width: 768px) {
        width: 3rem;
      }

      .el-scrollbar__view {
        padding: 0.5rem 0;
      }

      .tab-item {
        display: flex;
        align-items: center;
        height: 2rem;
        padding: 0 1rem;
        cursor: pointer;
        font-size: 0.875rem;
        justify-content: center;
        transition: var(--color-transition);

        &:hover {
          background-color: var(--k-hover-bg);
        }

        @media screen and (max-width: 768px) {
          padding: 0 0;
        }

        .market-icon {
          width: 1.25rem;
          height: 1rem;
        }

        &.active {
          color: var(--primary);
        }

        .title {
          width: 3.5rem;
          margin-left: 0.5rem;
          @media screen and (max-width: 768px) {
            display: none;
          }
        }
      }
    }

    .content {
      flex: 1 1 auto;

      .package {
        p {
          margin: 0;
          font-size: 14px;
        }

        &:hover {
          background-color: var(--k-hover-bg);
        }
      }
    }
  }
}

</style>
