<script setup lang="ts">
import { computed, ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { EmIcon as Icon, EmText, useLocale } from '@easemob-community/uikit-core'
import { formatComposerFileSize, scaleComposerImageSize } from './composer-segment'

const props = defineProps(nodeViewProps)
const { t } = useLocale()

const isVideo = computed(() => props.node.attrs.kind === 'video')
const filename = computed(() => String(props.node.attrs.filename || ''))
const filesize = computed(() => {
  const size = Number(props.node.attrs.filesize) || 0
  return size > 0 ? formatComposerFileSize(size) : ''
})
const videoSize = ref(scaleComposerImageSize(0, 0))

function onVideoMeta(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.videoWidth && video.videoHeight)
    videoSize.value = scaleComposerImageSize(video.videoWidth, video.videoHeight)
}

function remove() {
  props.deleteNode()
}
</script>

<template>
  <NodeViewWrapper as="div" class="rich-input__attachment">
    <div
      v-if="isVideo"
      class="rich-input__video-box"
      :style="{ width: `${videoSize.width}px`, height: `${videoSize.height}px` }"
    >
      <video
        class="rich-input__video-el"
        :src="node.attrs.src"
        preload="metadata"
        muted
        playsinline
        @loadedmetadata="onVideoMeta"
      />
      <button
        type="button"
        class="rich-input__media-remove"
        :aria-label="t('chat.input.removeAttachment')"
        @click.stop.prevent="remove"
      >
        <Icon name="circle/xmark" :size="14" />
      </button>
    </div>
    <div v-else class="rich-input__file-box">
      <div class="rich-input__file-icon">
        <Icon name="file/empty" :size="20" />
      </div>
      <div class="rich-input__file-info">
        <EmText level="body" weight="medium" ellipsis class="rich-input__file-name" :title="filename">
          {{ filename }}
        </EmText>
        <div v-if="filesize" class="rich-input__file-size">
          {{ filesize }}
        </div>
      </div>
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
.rich-input__attachment {
  display: block;
  width: fit-content;
  max-width: 100%;
  margin: 0 0 4px;
  outline: none;
}

.rich-input__video-box {
  position: relative;
  overflow: hidden;
  border-radius: var(--uikit-bubble-radius, 16px);
}

.rich-input__video-el {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background-color: var(--uikit-bg-tertiary, rgba(0, 0, 0, 0.06));
}

.rich-input__file-box {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 166px;
  max-width: 240px;
  padding: 10px 32px 10px 12px;
  box-sizing: border-box;
  border-radius: var(--uikit-file-card-radius, 12px);
  background-color: var(--uikit-bubble-bg-other);
  color: var(--uikit-bubble-text-other);
}

.rich-input__file-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--uikit-components-radius, 8px);
  background-color: var(--uikit-file-icon-file);
  color: var(--uikit-text-inverse, #fff);
}

.rich-input__file-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rich-input__file-name {
  color: var(--uikit-bubble-text-other);
  font-size: var(--uikit-font-size-15);
}

.rich-input__file-size {
  font-size: var(--uikit-font-size-11);
  color: var(--uikit-text-tertiary, #919BA1);
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
