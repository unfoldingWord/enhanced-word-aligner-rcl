import React from "react";

export interface HelloCardProps {
    /** The name to greet */
    name: string;
}

/**
 * A simple greeting card component
 */
const HelloCard: React.FC<HelloCardProps> = ({ name }) => (
    <div
        style={{
            border: "1px solid #ccc",
            padding: "1em",
            borderRadius: 8,
            background: "#f7fafc",
            display: "inline-block"
        }}
    >
        <h2>Hello, {name}!</h2>
    </div>
);

export default HelloCard;