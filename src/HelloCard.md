# HelloCard Component

The `HelloCard` is a simple React component that renders a greeting card with a personalized name.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | The name to be displayed in the greeting |

## Basic Usage
```jsx
import HelloCard from './HelloCard';

// Simple greeting
<HelloCard name="Alice" />
```
## Examples

### Default Greeting
A basic example showing how to use the HelloCard with a name.
```jsx
<HelloCard name="World" />
```
### Different Names
Demonstrating the component with various names:
```jsx
<div style={{ display: 'flex', gap: '10px' }}>
  <HelloCard name="John" />
  <HelloCard name="Sarah" />
  <HelloCard name="Developer" />
</div>
```
## Styling
The HelloCard has a soft, minimal design with:
- A light grey border
- Soft blue-grey background
- Rounded corners
- Inline block display

## Notes
- The component is designed to be simple and reusable
- It accepts any string as a name

This Markdown file provides:
- A description of the component
- Prop documentation
- Basic usage example
- Multiple usage scenarios
- Notes about styling and usage

The documentation follows Styleguidist conventions and provides clear, concise information about the `HelloCard` component.

