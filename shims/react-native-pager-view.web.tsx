/**
 * Web shim for react-native-pager-view.
 * Supports setPage/setPageWithoutAnimation via imperative handle.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';

interface PagerViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
  initialPage?: number;
  scrollEnabled?: boolean;
  onPageSelected?: (e: { nativeEvent: { position: number } }) => void;
  onPageScrollStateChanged?: (e: any) => void;
  [key: string]: any;
}

export interface PagerViewHandle {
  setPage: (page: number) => void;
  setPageWithoutAnimation: (page: number) => void;
}

const PagerView = React.forwardRef<PagerViewHandle, PagerViewProps>(
  ({ children, style, initialPage = 0, onPageSelected }, ref) => {
    const [currentPage, setCurrentPage] = React.useState(initialPage);
    const pages = React.Children.toArray(children);

    React.useImperativeHandle(ref, () => ({
      setPage(page: number) {
        setCurrentPage(page);
        onPageSelected?.({ nativeEvent: { position: page } });
      },
      setPageWithoutAnimation(page: number) {
        setCurrentPage(page);
        onPageSelected?.({ nativeEvent: { position: page } });
      },
    }));

    return (
      <View style={[{ flex: 1 }, style]}>
        {pages[currentPage] ?? pages[0] ?? null}
      </View>
    );
  },
);

PagerView.displayName = 'PagerView';

export default PagerView;
