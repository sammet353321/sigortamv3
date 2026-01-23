I will resolve the reported issues by updating the frontend and backend configurations.

1.  **Backend Connection**: I have already restarted the backend server (`node index.js`). It is now running on port 3004. This should resolve the `net::ERR_CONNECTION_REFUSED` error.
2.  **Number Formatting**: I will update `PolicyCut.tsx` to strictly format premiums as requested (e.g., `19600,48`). I will implement a helper function to strip thousands separators (dots) and ensure a comma is used for the decimal separator.
3.  **Company & Acente Mapping**: I will refine the post-scanning logic in `PolicyCut.tsx` to handle the specific mapping rules:
    *   "WİN..." -> "TİMURLAR"
    *   "KOÇ..." -> "KOÇ"
    *   "NESA..." -> "NESA"
    *   Remove "SİGORTA" suffix from company names (e.g. "NEOVA SİGORTA" -> "NEOVA").
4.  **Date Formatting**: I will update the Gemini prompt in `gemini.ts` to explicitly request `DD.MM.YYYY` format and improve the frontend date parser to handle `YYYY-MM-DD` fallback more robustly.
5.  **Error Handling**: I will add better error catching around the policy upload and scanning process to prevent the "White Screen" crash, ensuring that if scanning fails, the user gets a toast notification instead of a crash.

**Files to be modified:**
*   `src/lib/gemini.ts`: Update prompt for stricter date and number formats.
*   `src/pages/employee/PolicyCut.tsx`: Implement number formatting, mapping rules, and robust error handling.
