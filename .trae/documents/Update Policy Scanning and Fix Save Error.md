I have researched the codebase and identified the necessary changes to address your requests.

**1. Acente Mapping & Company Name Cleaning:**
-   I will update `src/pages/employee/PolicyCut.tsx` to include a post-processing step in `handlePolicyFileUpload`.
-   This logic will:
    -   Check the scanned `acente` value. If it contains "WİN GRUP", set it to "TİMURLAR". If "KOÇ SİGORTA", set to "KOÇ". If "NESA SİGORTA", set to "NESA".
    -   Check the scanned `sirket` value. It will remove the word "SİGORTA" (case-insensitive) to leave just the brand name (e.g., "NEOVA", "AK", "HEPİYİ").

**2. Date Format Fix:**
-   I verified that the `formatDateForDisplay` function in `PolicyCut.tsx` already handles `YYYY-MM-DD` -> `DD.MM.YYYY` conversion.
-   However, to be absolutely sure and handle edge cases, I will update the prompt in `src/lib/gemini.ts` to explicitly request the date in `DD.MM.YYYY` format from the AI model itself.
-   I will also refine the `formatDateForDisplay` in `PolicyCut.tsx` to ensure it handles the `2027-01-22` format robustly even if Gemini returns it that way.

**3. Save Error (PDF Mime Type):**
-   The error `StorageApiError: mime type application/pdf is not supported` indicates the `chat-media` bucket might be restricted to image files.
-   I found that other parts of the app (like `QuoteDetail.tsx`) use a `documents` bucket for files.
-   I will update `handleSave` in `PolicyCut.tsx` to use the `documents` bucket instead of `chat-media` for policy uploads. This should resolve the PDF upload issue.

**Plan:**
1.  **Modify `src/lib/gemini.ts`**: Update the prompt to request `DD.MM.YYYY` date format.
2.  **Modify `src/pages/employee/PolicyCut.tsx`**:
    -   Update `handlePolicyFileUpload` to implement the Acente and Company name mapping rules.
    -   Update `handleSave` to upload files to the `documents` bucket.
