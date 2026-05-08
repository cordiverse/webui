<template>
  <k-content v-if="currentEntry">
    <div class="section-header">
      <h2>服务依赖</h2>
      <button class="button-add" title="添加依赖项" @click="showAddDependency = true">
        <k-icon name="add"/>
      </button>
    </div>
    <div class="card mb-4">
      <table v-if="hasUsing" class="dep-table">
        <tbody>
          <tr
            v-for="({ required, provider }, name) in env.using"
            :key="name"
            :class="{ clickable: !!provider?.schema }"
            @click="provider?.schema && goConfig(name)"
          >
            <td class="text-left">
              <span
                v-if="required !== undefined"
                class="tag"
                :class="required ? 'tag-required' : 'tag-optional'"
              >{{ required ? '必需' : '可选' }}</span>
              <span class="service-name">{{ name }}</span>
            </td>
            <td class="col-dot">
              <span class="status-dot" :class="depStatusClass(provider, required)"></span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">该插件当前未声明任何依赖项。</p>
    </div>

    <div class="section-header">
      <h2>服务隔离域</h2>
      <button class="button-add" title="创建隔离域" @click="showCreateIsolate = true">
        <k-icon name="add"/>
      </button>
    </div>
    <div class="card mb-4">
      <table v-if="hasIsolate" class="dep-table">
        <tr v-for="(label, name) in currentEntry.isolate" :key="name">
          <td class="text-left">
            <span class="tag" :class="label === true ? 'tag-private' : 'tag-shared'">
              {{ label === true ? '私有' : '共享' }}
            </span>
            <span class="service-name">{{ name }}</span>
          </td>
          <td>
            <span v-if="label === true" class="status-missing">—</span>
            <span v-else class="service-name">{{ label }}</span>
          </td>
          <td class="col-dot">
            <span
              class="status-dot"
              :class="getService(name, label) ? 'running' : 'stopped'"
            ></span>
          </td>
        </tr>
      </table>
      <p v-else class="empty">该插件当前未配置隔离域。</p>
    </div>
  </k-content>

  <el-dialog
    destroy-on-close
    v-model="showAddDependency"
    title="添加依赖项"
  >
    <p><el-input ref="inputEl" v-model="input" @keydown.enter.stop.prevent="addDependency"/></p>
    <template #footer>
      <el-checkbox v-model="isRequired">必需依赖</el-checkbox>
      <div class="grow-1">
        <el-button @click="showAddDependency = false">取消</el-button>
        <el-button type="primary" @click="addDependency">确定</el-button>
      </div>
    </template>
  </el-dialog>

  <el-dialog
    destroy-on-close
    v-model="showCreateIsolate"
    title="创建隔离域"
  >
    <p><el-input ref="inputEl" v-model="input"/></p>
    <p><el-input ref="inputEl" v-model="label" placeholder="留空时将创建私有隔离域"/></p>
    <template #footer>
      <el-button @click="showCreateIsolate = false">取消</el-button>
      <el-button type="primary" @click="createIsolate">确定</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import { useRouter } from '@cordisjs/client'
import { send, useContext } from '@cordisjs/client'
import type { Provider } from '../../src'

const ctx = useContext()
const router = useRouter()

const showAddDependency = ref(false)
const showCreateIsolate = ref(false)
const isRequired = ref(false)
const input = ref('')
const label = ref('')

const currentEntry = computed(() => ctx.manager.currentEntry!)
const services = computed(() => ctx.manager.data.value.services)
const env = computed(() => ctx.manager.getEnvInfo(currentEntry.value)!)

const hasUsing = computed(() => env.value?.using && Object.keys(env.value.using).length > 0)
const hasIsolate = computed(() => currentEntry.value?.isolate && Object.keys(currentEntry.value.isolate).length > 0)

function canGoto(location?: string) {
  return !!location && location in ctx.manager.plugins.value.entries
}

function goProvider(location?: string) {
  if (canGoto(location)) router.push('/plugins/' + location)
}

function goConfig(name: string) {
  router.push('/plugins/' + currentEntry.value.id + '/service/' + name)
}

function depStatusClass(provider: Provider | undefined, required: boolean | undefined) {
  if (provider) return 'running'
  if (required) return 'warning'
  return 'stopped'
}

function getService(name: string, label: string | true) {
  if (!services.value[name]) return
  if (label === true) {
    return services.value[name].local[currentEntry.value.id]?.location
  } else {
    return services.value[name].global[label]?.location
  }
}

function addDependency() {
  send('manager.config.update', {
    id: currentEntry.value.id,
    inject: {
      ...currentEntry.value.inject,
      [input.value]: { required: isRequired.value },
    },
  })
}

function createIsolate() {
  send('manager.config.update', {
    id: currentEntry.value.id,
    isolate: {
      ...currentEntry.value.isolate,
      [input.value]: label.value || true,
    },
  })
}

</script>

<style lang="scss" scoped>

h2 {
  &:first-child {
    margin-top: 0;
  }
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 2rem 0 1rem;

  &:first-child {
    margin-top: 0;
  }

  h2 {
    margin: 0;
    flex: 1;
  }
}

.button-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: var(--color-transition);

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.tag {
  display: inline-block;
  padding: 1px 6px;
  margin-right: 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  vertical-align: middle;
  background: var(--accent-muted);
  color: var(--accent);

  // &.tag-required { background: var(--warning-muted); color: var(--warning); }
  // &.tag-optional { background: var(--bg-hover);      color: var(--text-tertiary); }
  // &.tag-private  { background: var(--accent-muted);  color: var(--accent); }
  // &.tag-shared   { background: var(--success-muted); color: var(--success); }
}

.service-name {
  font-family: var(--font-mono);
  font-size: 13px;
  vertical-align: middle;
}

.status-loaded { color: var(--success); }
.status-missing {
  color: var(--text-tertiary);

  &.is-required { color: var(--warning); }
}

.card {
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.dep-table {
  width: 100%;
  border-collapse: collapse;

  th {
    text-align: left;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-tertiary);
    padding: 8px 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  td {
    padding: 8px 12px;
    font-size: 13px;
    vertical-align: middle;
  }

  tr {
    transition: var(--color-transition);
  }

  tr:first-child {
    border-top: none;
  }

  tr:last-child {
    border-bottom: none;
  }

  tr.clickable {
    cursor: pointer;

    &:hover td {
      background: var(--bg-hover);
    }
  }

  .col-dot {
    width: 1.25rem;
    padding-left: 0;
    padding-right: 16px;
    text-align: right;
  }

  .status-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
  }

  .col-actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
    padding-right: 8px;
  }
}

.row-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 1;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: var(--color-transition);

  & + & { margin-left: 4px; }

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.row-btn-icon {
  width: 24px;
  padding: 0;
  font-size: 14px;
}

.empty {
  padding: 1rem;
  color: var(--text-tertiary);
  text-align: center;
  font-size: 13px;
}

</style>
