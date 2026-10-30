<script setup lang="ts">
import { ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { EmIcon as Icon, useLocale } from '@easemob-community/uikit-core'
import { scaleComposerImageSize } from './composer-segment'

const props = defineProps(nodeViewProps)
const { t } = useLocale()

const displaySize = ref(scaleComposerImageSize(0, 0))

function onLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (img?.naturalWidth && img.naturalHeight)
    displaySize.value = scaleComposerImageSize(img.naturalWidth, img.naturalHeight)
}

function remove() {
  props.deleteNode()
}
</script>

<template>
  <NodeViewWrapper as="div" class="rich-input__image">
    <div
      class="rich-input__image-box"
      :style="{ width: `${displaySize.width}px`, height: `${displaySize.height}px` }"
    >
      <img
        class="rich-input__image-el"
        :src="node.attrs.src"
        alt=""
        draggable="false"
        @load="onLoad"
      >
      <button
        type="button"
        class="rich-input__media-remove"
        :aria-label="t('chat.input.removeAttachment')"
        @click.stop.prevent="remove"
      >
        <Icon name="circle/xmark" :size="14" />
      </button>
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.rich-input__image {
  display: block;
  width: fit-content;
  max-width: 100%;
  margin: 0 0 4px;
  outline: none;
}

.rich-input__image-box {
  position: relative;
  overflow: hidden;
  border-radius: var(--uikit-bubble-radius, 16px);
}

.rich-input__image-el {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.rich-input__media-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--uikit-text-secondary);
  cursor: pointer;
  background-color: var(--uikit-input-bg, #fff);
  border: 0;
  border-radius: 50%;
}
</style>
