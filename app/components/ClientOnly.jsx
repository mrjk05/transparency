import { useState, useEffect } from "react";

export function ClientOnly({ children, fallback = null }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);
    return mounted ? children : fallback;
}
