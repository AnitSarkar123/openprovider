'use client';

import { code } from '@streamdown/code';
import clsx from 'clsx';
import { Streamdown, type StreamdownProps } from 'streamdown';

type AssistantMarkdownProps = {
  content: string;
  streaming?: boolean;
  className?: string;
};

const markdownPlugins: NonNullable<StreamdownProps['plugins']> = {
  code,
};

const markdownControls: NonNullable<StreamdownProps['controls']> = {
  code: {
    copy: true,
    download: false,
  },
  table: {
    copy: true,
    download: false,
    fullscreen: false,
  },
  mermaid: false,
};

export function AssistantMarkdown({ content, streaming = false, className }: AssistantMarkdownProps) {
  return (
    <Streamdown
      animated={streaming ? { animation: 'fadeIn', duration: 120, stagger: 8 } : false}
      className={clsx('assistant-markdown', className)}
      controls={markdownControls}
      dir="auto"
      isAnimating={streaming}
      lineNumbers={false}
      mode={streaming ? 'streaming' : 'static'}
      normalizeHtmlIndentation
      parseIncompleteMarkdown={streaming}
      plugins={markdownPlugins}
      shikiTheme={['github-light', 'github-dark']}
      skipHtml
    >
      {content}
    </Streamdown>
  );
}
