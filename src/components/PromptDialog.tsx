/**
 * PromptDialog Component
 *
 * Synopsis:
 * A reusable confirmation dialog component that provides a standardized interface
 * for confirming user actions throughout the application.
 *
 * Description:
 * This modal dialog presents users with a confirmation prompt before proceeding with
 * potentially important or destructive actions. It features customizable content,
 * title, and button text to handle various confirmation scenarios while maintaining
 * a consistent user experience across the application.
 *
 * Properties:
 * @param {string} content - The main message or question displayed in the dialog body
 * @param {string} noText - Text for the negative/cancel button (optional)
 * @param {boolean} open - Controls the visibility of the dialog
 * @param {Function} onClose - Handler called when the dialog should be closed (optional)
 * @param {Function} onNo - Handler called when the user clicks the negative/cancel button (optional)
 * @param {Function} onYes - Handler called when the user confirms the action
 * @param {string} title - The title displayed at the top of the dialog
 * @param {Function} translate - Translation function for UI text localization
 * @param {string} yesText - Text for the positive/confirmation button
 */

import React from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'

export interface TShowPromptDialogProps {
    /** The main message or question displayed in the dialog body */
    content?: string;
    /** Text for the negative/cancel button (optional) */
    noText?: string;
    /** Controls the visibility of the dialog */
    open?: boolean;
    /** Handler called when the dialog should be closed (optional) */
    onClose?: () => void;
    /** Handler called when the user clicks the negative/cancel button (optional) */
    onNo?: () => void;
    /** Handler called when the user confirms the action */
    onYes?: () => void;
    /** The title displayed at the top of the dialog */
    title?: string;
    /** Text for the positive/confirmation button */
    yesText?: string;
}

export interface PromptDialogProps extends TShowPromptDialogProps {
    /** Translation function for UI text localization */
    translate: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * A functional React component that renders a prompt dialog with customizable title, content, and actions.
 * Used to display a confirmation or warning dialog with "Yes" and optionally "No" button actions.
 *
 * @typedef {Object} PromptDialogProps
 * @property {string} content - The message or content displayed within the dialog.
 * @property {string} [noText] - Text for the "No" button. Optional, displayed if `onNo` is provided.
 * @property {boolean} open - Determines whether the dialog is visible.
 * @property {function} onClose - Callback function invoked when the dialog is closed.
 * @property {function} [onNo] - Callback function invoked when the "No" button is clicked. Optional.
 * @property {function} onYes - Callback function invoked when the "Yes" button is clicked.
 * @property {string} title - The title of the dialog.
 * @property {function} translate - Function for translating the displayed text (optional, based on context).
 * @property {string} yesText - Text for the "Yes" button.
 *
 * @type {React.FC<PromptDialogProps>}
 */
const PromptDialog: React.FC<PromptDialogProps> = ({
  content,
  noText,
  open,
  onClose,
  onNo,
  onYes,
  title,
  translate,
  yesText
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="reset-warn-dialog"
    >
      <DialogTitle id="form-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {content}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {onNo && (
          <Button onClick={onNo} color="primary">
            {noText}
          </Button>
        )}
        <Button onClick={onYes} color="secondary">
          {yesText}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default PromptDialog
