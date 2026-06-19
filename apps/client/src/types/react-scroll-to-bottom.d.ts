declare module 'react-scroll-to-bottom' {
  import * as React from 'react';

  export interface ScrollToBottomProps {
    className?: string;
    children?: React.ReactNode;
    checkInterval?: number;
    debounce?: number;
    followButtonClassName?: string;
    mode?: 'bottom' | 'top';
    nonce?: string;
    scrollViewClassName?: string;
  }

  export default class ScrollToBottom extends React.Component<ScrollToBottomProps> {}
}
