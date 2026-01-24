I will fix the vertical scrolling issue by addressing both the CSS layout in the parent container and the scroll detection logic in the table component.

### 1. Fix Layout in `src/pages/admin/Policies.tsx`
The current layout forces the table container to be `h-full` (100% height) while sitting *below* a header, causing the total content to exceed the viewport height. This pushes the bottom of the table off-screen.
- **Change**: Convert the main container to a Flexbox column (`flex flex-col`).
- **Change**: Set the table wrapper to `flex-1 min-h-0` instead of `h-full`. This ensures it occupies only the remaining available space.

### 2. Improve Scroll Detection in `src/components/PolicyTable.tsx`
The current scroll detection uses strict equality (`===`), which can fail due to fractional pixel differences, preventing infinite scroll from loading more data.
- **Change**: Update `handleScroll` to use a tolerance threshold (e.g., `< 1px`) instead of strict equality.

### Verification
- I will verify that the layout uses proper Flexbox structure.
- I will verify the scroll logic is more robust.
