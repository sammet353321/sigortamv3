I will completely rewrite `src/components/PolicyTable.tsx` to remove the dependency on the external grid library (`@svar-ui/react-grid`) which is causing the scrolling issues. I will replace it with a standard, high-performance HTML Table implementation.

**Key Features of the New Implementation:**
1.  **Native Browser Scrolling**: Using standard `overflow-auto` on a container `div`. This guarantees that vertical scrolling (mouse wheel) and horizontal scrolling work perfectly and reliably.
2.  **Sticky Headers & Columns**:
    *   **Sticky Header**: The top row will stay fixed when scrolling down.
    *   **Sticky First Column**: The "Ad Soyad" column will stay fixed when scrolling right.
3.  **Preserved Functionality**:
    *   **Infinite Scroll**: Automatically load more records when scrolling to the bottom.
    *   **Sorting**: Clickable column headers to sort ascending/descending.
    *   **Filtering**: Search and Month filters will remain exactly as they are.
4.  **Clean Code**: A standard React component structure that is easy to maintain and debug.

This approach eliminates the "hidden" layout calculations of the complex grid library and uses standard CSS that browsers handle natively.