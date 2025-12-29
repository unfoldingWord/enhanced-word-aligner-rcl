
import React, { useCallback } from 'react';
import { makeStyles } from '@mui/styles'
import Popover from '@mui/material/Popover';
import Divider from '@mui/material/Divider';
import { IconButton } from '@mui/material'
import { CgClose } from 'react-icons/cg'
import useWindowEvent from '../hooks/useWindowEvent';

const useStyles = makeStyles(() => ({
  popover: {
    padding: '0.75em',
    maxWidth: '400px',
  }
}))

interface PopoverComponentProps {
  /** Controls the visibility of the popover */
  popoverVisibility: boolean;
  /** The title displayed in the popover header */
  title: React.ReactNode;
  /** The main content text of the popover */
  bodyText: React.ReactNode;
  /** The element or coordinates to anchor the popover to */
  positionCoord: Element | null;
  /** Callback function to close the popover */
  onClosePopover: () => void;
}

const PopoverComponent: React.FC<PopoverComponentProps> = ({
  popoverVisibility,
  title,
  bodyText,
  positionCoord,
  onClosePopover,
}) => {
  const classes = useStyles();
  const onEscapeKeyPressed = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.keyCode === 27) {
      onClosePopover();
    }
  },[onClosePopover]);

  useWindowEvent({ type: 'keydown', callback: onEscapeKeyPressed})

  return (
    <div>
      <Popover
        classes={{paper: classes.popover}}
        open={popoverVisibility}
        anchorEl={positionCoord}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        onClose={onClosePopover}
      >
        <div style={{
          display: 'flex', alignItems:'top', padding: 0,
        }}>
          <span style={{
            fontSize: '1.2em', fontWeight: 'bold', marginBottom: 10, marginTop: 0, paddingTop: 0,
          }}>
            {title}
          </span>
          <IconButton
            key='lexicon-close-button'
            onClick={onClosePopover}
            title={'Close Lexicon'}
            aria-label={'Close Lexicon'}
            style={{
              paddingTop: '0px',
              cursor: 'pointer',
              alignItems: 'top',
              marginLeft: 'auto', marginRight: 5,
            }}
          >
            <CgClose id='lexicon-close-icon' color='black' />
          </IconButton>
        </div>
        <Divider />
        <span style={{ padding: '10px 0 15px 0' }}>
          {bodyText}
        </span>
      </Popover>
    </div>
  );
}

export default PopoverComponent;