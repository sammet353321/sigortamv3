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
        <div className="p-6 h-[calc(100vh-80px)]">
            <div className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Poliçe Yönetimi</h1>
                    <p className="text-gray-500">Tüm sigorta poliçelerini buradan yönetebilirsiniz.</p>
                </div>
                <button 
                    onClick={() => setImportModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-sm"
                >
                    <Upload size={18} />
                    Excel Yükle
                </button>
            </div>
            
            <div className="h-full">
                <PolicyTable key={refreshKey} />
            </div>

            <PolicyImportModal 
                isOpen={isImportModalOpen}
                onClose={() => setImportModalOpen(false)}
                onSuccess={handleImportSuccess}
            />
        </div>
    );
}
