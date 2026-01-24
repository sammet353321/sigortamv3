import React, { useState } from 'react';
import PolicyTable from '@/components/PolicyTable';
import PolicyImportModal from '@/components/PolicyImportModal';
import { Upload } from 'lucide-react';

export default function AdminPoliciesPage() {
    const [isImportModalOpen, setImportModalOpen] = useState(false);

    // We can use a key to force re-render/refresh the table after import
    const [refreshKey, setRefreshKey] = useState(0);

    const handleImportSuccess = () => {
        setRefreshKey(prev => prev + 1);
    };

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="mb-6 flex justify-between items-end flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Poliçe Yönetimi</h1>
                    <p className="text-gray-500">Tüm sigorta poliçelerini buradan yönetebilirsiniz.</p>
                </div>
                {/* Button moved inside PolicyTable for better UX */}
            </div>
            
            <div className="flex-1 min-h-0">
                <PolicyTable key={refreshKey} />
            </div>
        </div>
    );
}
