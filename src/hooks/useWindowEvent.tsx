import { useEffect } from 'react';

/**
 * Props for the useWindowEvent hook
 */
interface UseWindowEventProps {
  /** The type of window event to listen for */
  type: string;
  /** The callback function to execute when the event occurs */
  callback: (event: Event) => void;
}

/**
 * Takes a type of window event and a callback and attaches and removes it from window.
 * @param props - The hook configuration
 */
const useWindowEvent = ({ type, callback }: UseWindowEventProps): void => {
  useEffect(() => {
    window.addEventListener(type, callback);
    return () => {
      window.removeEventListener(type, callback);
    };
  }, [type, callback]);
}

export default useWindowEvent;