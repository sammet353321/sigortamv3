import React from 'react';
import PolicyTable from '@/components/PolicyTable';

export default function EmployeePoliciesPage() {
    return (
        <div className="p-6 h-full flex flex-col">
            <div className="mb-6 flex justify-between items-end flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Poliçelerim</h1>
                    <p className="text-gray-500">Sizin tarafınızdan kesilen poliçeler</p>
                </div>
            </div>
            
            <div className="flex-1 min-h-0">
                <PolicyTable />
            </div>
        </div>
    );
}
