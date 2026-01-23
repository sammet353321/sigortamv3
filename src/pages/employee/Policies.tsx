
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { format } from 'date-fns';
import { Search, Filter, Eye, ArrowRight, Download, MoreVertical, X, Check, FileText, Trash2, Edit, Car } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export default function EmployeePoliciesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [uniqueTypes, setUniqueTypes] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0-11, 12 => Tümü
  
  // Action Modals State
  const [selectedPolicy, setSelectedPolicy] = useState<any>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showZeyilModal, setShowZeyilModal] = useState(false);
  const [zeyilType, setZeyilType] = useState<'plaka' | 'arac' | 'iptal'>('plaka');
  
  // Zeyil Form States
  const [zPlaka, setZPlaka] = useState('');
  const [zBelgeNo, setZBelgeNo] = useState('');
  const [zAracCinsi, setZAracCinsi] = useState('');
  
  // Cancel Form States
  const [cBrut, setCBrut] = useState('');
  const [cNet, setCNet] = useState('');
  const [cKom, setCKom] = useState('');
  const [cFile, setCFile] = useState<File | null>(null);
  const [cProcessing, setCProcessing] = useState(false);

  useEffect(() => {
    fetchPolicies();
  }, [user, selectedMonth]);

  const fetchPolicies = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      let query = supabase
        .from('policeler')
        .select('*, ilgili_kisi:users!ilgili_kisi_id(name, phone), kesen:users!kesen_id(name)')
        .eq('kesen_id', user.id)
        .order('tarih', { ascending: false });
      if (selectedMonth >= 0 && selectedMonth <= 11) {
        const now = new Date();
        const start = new Date(now.getFullYear(), selectedMonth, 1);
        const end = new Date(now.getFullYear(), selectedMonth + 1, 1);
        query = query.gte('tarih', start.toISOString()).lt('tarih', end.toISOString());
      }
      const { data, error } = await query;

      if (error) throw error;
      setPolicies(data || []);
      const types = Array.from(new Set((data || []).map(p => p.tur).filter(Boolean)));
      setUniqueTypes(types);
    } catch (error) {
      console.error('Error fetching policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (policy: any) => {
      setSelectedPolicy(policy);
      setShowActionModal(true);
  };

  const handleCellContextMenu = (e: React.MouseEvent, text: string | number | null | undefined) => {
      e.preventDefault();
      if (!text) return;
      const textToCopy = String(text);
      
      const copyToClipboard = async () => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(textToCopy);
                toast.success(`Kopyalandı: ${textToCopy}`, { id: 'copy', duration: 1000, icon: '📋' });
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = textToCopy;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                toast.success(`Kopyalandı: ${textToCopy}`, { id: 'copy', duration: 1000, icon: '📋' });
            }
        } catch (err) {
            console.error('Copy failed', err);
            toast.error('Kopyalama başarısız');
        }
      };

      copyToClipboard();
  };

  const openZeyil = (type: 'plaka' | 'arac' | 'iptal') => {
      setZeyilType(type);
      setShowActionModal(false);
      setShowZeyilModal(true);
      
      // Prefill
      setZPlaka(selectedPolicy.plaka || '');
      setZBelgeNo(selectedPolicy.belge_no || '');
      setZAracCinsi(selectedPolicy.arac_cinsi || '');
      // Clear Cancel fields
      setCBrut(''); setCNet(''); setCKom(''); setCFile(null);
  };

  const handleSaveZeyil = async () => {
      if (!selectedPolicy) return;
      
      try {
          const updates: any = {};
          if (zeyilType === 'plaka') {
              updates.plaka = zPlaka;
              updates.belge_no = zBelgeNo;
          } else if (zeyilType === 'arac') {
              updates.plaka = zPlaka;
              updates.belge_no = zBelgeNo;
              updates.arac_cinsi = zAracCinsi;
          }

          const { error } = await supabase
              .from('policeler')
              .update(updates)
              .eq('id', selectedPolicy.id);

          if (error) throw error;

          toast.success('Zeyil işlemi kaydedildi.');
          setShowZeyilModal(false);
          fetchPolicies();
      } catch (error) {
          console.error('Error saving zeyil:', error);
          toast.error('Hata oluştu.');
      }
  };

  const calcCancelCommission = (rate: number) => {
      const net = parseFloat(cNet);
      if (!isNaN(net)) {
          setCKom((net * rate).toFixed(2));
      } else {
          toast.error('Lütfen önce Net Prim giriniz.');
      }
  };

  const handleCancelPolicy = async () => {
      if (!selectedPolicy) return;
      setCProcessing(true);

      try {
          let fileUrl = null;
          if (cFile) {
              const fileExt = cFile.name.split('.').pop();
              const fileName = `iptal-${Date.now()}.${fileExt}`;
              const filePath = `${user?.id}/${fileName}`;
              
              const { error: uploadError } = await supabase.storage
                  .from('documents')
                  .upload(filePath, cFile);
              
              if (!uploadError) {
                  const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
                  fileUrl = data.publicUrl;
              }
          }

          // 1. Update Policy Status
          const { error } = await supabase
              .from('policeler')
              .update({ 
                  durum: 'iptal', // Ensure status enum supports 'iptal' or text
                  // Maybe store cancel details in ek_bilgiler or separate table?
                  // User requested just status change and message.
                  ek_bilgiler: (selectedPolicy.ek_bilgiler || '') + `\n[İPTAL EDİLDİ] İade Brüt: ${cBrut}, Net: ${cNet}, Kom: ${cKom}`
              })
              .eq('id', selectedPolicy.id);

          if (error) throw error;

          // 2. Send WhatsApp Message
          const taliPhone = selectedPolicy.ilgili_kisi?.phone || selectedPolicy.misafir_bilgi?.phone;
          const groupId = selectedPolicy.misafir_bilgi?.group_id;

          if (taliPhone) {
              const messageText = `İPTAL BELGESİ\n${selectedPolicy.ad_soyad} - ${selectedPolicy.tur} - ${selectedPolicy.plaka} - İPTAL EDİLMİŞTİR.`;
              
              // Send Document
              if (fileUrl) {
                  await supabase.from('messages').insert({
                      sender_phone: taliPhone,
                      group_id: groupId || null,
                      direction: 'outbound',
                      type: 'image', // or document
                      media_url: fileUrl,
                      content: '',
                      status: 'pending'
                  });
              }

              // Send Text
              await supabase.from('messages').insert({
                  sender_phone: taliPhone,
                  group_id: groupId || null,
                  direction: 'outbound',
                  type: 'text',
                  content: messageText,
                  status: 'pending'
              });
          }

          toast.success('Poliçe iptal edildi ve mesaj gönderildi.');
          setShowZeyilModal(false);
          fetchPolicies();

      } catch (error) {
          console.error('Error cancelling:', error);
          toast.error('İptal işlemi başarısız.');
      } finally {
          setCProcessing(false);
      }
  };

  const filteredPolicies = policies.filter(policy => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (
      (policy.plaka?.toLowerCase().includes(searchLower) || '') ||
      (policy.tc_vkn?.includes(searchLower) || '') ||
      (policy.ilgili_kisi?.name?.toLowerCase().includes(searchLower) || '') ||
      (policy.police_no?.toLowerCase().includes(searchLower) || '')
    );
    const matchesType = filterType === 'all' || policy.tur === filterType;
    return matchesSearch && matchesType;
  });

  const downloadExcel = () => {
    if (!filteredPolicies.length) return;
    const headers = ['AD SOYAD', 'DOĞUM TARİHİ', 'ŞİRKET', 'TARİH', 'ŞASİ', 'PLAKA', 'TC/VKN', 'BELGE NO', 'ARAÇ CİNSİ', 'BRÜT PRİM', 'TÜR', 'KESEN', 'İLGİLİ KİŞİ', 'POLİÇE NO', 'ACENTE', 'KART', 'EK BİLGİLER / İLETİŞİM', 'NET PRİM', 'KOMİSYON'];
    const csvContent = [
      headers.join(';'),
      ...filteredPolicies.map(p => {
        const date = p.dogum_tarihi ? format(new Date(p.dogum_tarihi), 'dd.MM.yyyy') : '';
        const createdDate = format(new Date(p.tarih), 'dd.MM.yyyy');
        const kesen = user?.name || 'Ben';
        // const ilgiliKisi = p.ilgili_kisi?.name || '';
        // Prefer 'tali' column if available, else fallback to relation
        const ilgiliKisi = p.tali || p.ilgili_kisi?.name || (p.misafir_bilgi as any)?.group_name || '';
        const kartLink = p.kart_bilgisi || '';
        return [
          `"${p.ad_soyad || ''}"`, `"${date}"`, `"${p.sirket || ''}"`, `"${createdDate}"`, `"${p.sasi_no || ''}"`,
          `"${p.plaka || ''}"`, `"${p.tc_vkn || ''}"`, `"${p.belge_no || ''}"`, `"${p.arac_cinsi || ''}"`,
          `"${p.brut_prim || ''}"`, `"${p.tur || ''}"`, `"${kesen}"`, `"${ilgiliKisi}"`, `"${p.police_no || ''}"`,
          `"${p.acente || ''}"`, `"${kartLink}"`, `"${(p.ek_bilgiler || '').replace(/"/g, '""')}"`,
          `"${p.net_prim || ''}"`, `"${p.komisyon || ''}"`
        ].join(';');
      })
    ].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `policeler_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 relative">
      
      {/* ACTION SELECTION MODAL */}
      {showActionModal && selectedPolicy && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
                  <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                      <h3 className="font-bold text-gray-800">İşlem Seçiniz</h3>
                      <button onClick={() => setShowActionModal(false)}><X size={20} className="text-gray-500" /></button>
                  </div>
                  <div className="p-4 space-y-3">
                      <button onClick={() => openZeyil('plaka')} className="w-full py-3 bg-blue-50 text-blue-700 font-bold rounded-lg hover:bg-blue-100 flex items-center justify-center">
                          <Edit size={18} className="mr-2" /> PLAKA ZEYİLİ
                      </button>
                      <button onClick={() => openZeyil('arac')} className="w-full py-3 bg-indigo-50 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 flex items-center justify-center">
                          <Car size={18} className="mr-2" /> ARAÇ DEĞİŞİKLİĞİ
                      </button>
                      <button onClick={() => openZeyil('iptal')} className="w-full py-3 bg-red-50 text-red-700 font-bold rounded-lg hover:bg-red-100 flex items-center justify-center">
                          <Trash2 size={18} className="mr-2" /> İPTAL
                      </button>
                      <div className="border-t pt-3 mt-2">
                        <button onClick={() => navigate(`/employee/policies/${selectedPolicy.id}`)} className="w-full py-2 bg-gray-100 text-gray-600 font-medium rounded-lg hover:bg-gray-200">
                            Detayları Görüntüle
                        </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* ZEYİL / CANCEL MODAL */}
      {showZeyilModal && selectedPolicy && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
                  <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                      <h3 className="font-bold text-gray-800">
                          {zeyilType === 'plaka' && 'PLAKA ZEYİLİ'}
                          {zeyilType === 'arac' && 'ARAÇ DEĞİŞİKLİĞİ'}
                          {zeyilType === 'iptal' && 'POLİÇE İPTALİ'}
                      </h3>
                      <button onClick={() => setShowZeyilModal(false)}><X size={20} className="text-gray-500" /></button>
                  </div>
                  
                  <div className="p-5 space-y-4">
                      {zeyilType !== 'iptal' ? (
                          <>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1">PLAKA</label>
                                  <input type="text" value={zPlaka} onChange={(e) => setZPlaka(e.target.value)} className="w-full border p-2 rounded" />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1">BELGE NO</label>
                                  <input type="text" value={zBelgeNo} onChange={(e) => setZBelgeNo(e.target.value)} className="w-full border p-2 rounded" />
                              </div>
                              {zeyilType === 'arac' && (
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 mb-1">ARAÇ CİNSİ</label>
                                      <input type="text" value={zAracCinsi} onChange={(e) => setZAracCinsi(e.target.value)} className="w-full border p-2 rounded" />
                                  </div>
                              )}
                              <button onClick={handleSaveZeyil} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">
                                  KAYDET
                              </button>
                          </>
                      ) : (
                          <>
                              {/* IPTAL FORM */}
                              <div className="bg-red-50 p-3 rounded border border-red-100 mb-2">
                                  <label className="block text-xs font-bold text-red-800 mb-2">İptal Belgesi Yükle</label>
                                  <input type="file" onChange={(e) => setCFile(e.target.files?.[0] || null)} className="w-full text-sm" />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 mb-1">İade Brüt Prim</label>
                                      <input type="number" value={cBrut} onChange={(e) => setCBrut(e.target.value)} className="w-full border p-2 rounded text-right" placeholder="0.00" />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 mb-1">İade Net Prim</label>
                                      <input type="number" value={cNet} onChange={(e) => setCNet(e.target.value)} className="w-full border p-2 rounded text-right" placeholder="0.00" />
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1 flex justify-between">
                                      İade Komisyon
                                      <div className="flex gap-1">
                                          <button onClick={() => calcCancelCommission(0.10)} className="bg-gray-200 text-[10px] px-1 rounded font-bold">T</button>
                                          <button onClick={() => calcCancelCommission(0.15)} className="bg-gray-200 text-[10px] px-1 rounded font-bold">K</button>
                                      </div>
                                  </label>
                                  <input type="number" value={cKom} onChange={(e) => setCKom(e.target.value)} className="w-full border p-2 rounded text-right" placeholder="0.00" />
                              </div>
                              <button 
                                  onClick={handleCancelPolicy} 
                                  disabled={cProcessing}
                                  className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 flex items-center justify-center"
                              >
                                  {cProcessing ? 'İşleniyor...' : 'KAYDET VE GÖNDER'}
                              </button>
                          </>
                      )}
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Poliçelerim</h1>
          <p className="text-gray-500 text-sm">Sizin tarafınızdan kesilen poliçeler</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button 
            onClick={downloadExcel}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={18} />
            Excel İndir
          </button>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <select 
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white w-full sm:w-48"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">Tüm Ürünler</option>
              {uniqueTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <select 
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white w-full sm:w-48"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'].map((m, idx) => (
                <option key={m} value={idx}>{m}</option>
              ))}
              <option value={12}>Tümü</option>
            </select>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Plaka, TC, Poliçe No ara..." 
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold whitespace-nowrap">
                <th className="px-4 py-3">AD SOYAD</th>
                <th className="px-4 py-3">DOĞUM TARİHİ</th>
                <th className="px-4 py-3">ŞİRKET</th>
                <th className="px-4 py-3">TARİH</th>
                <th className="px-4 py-3">ŞASİ</th>
                <th className="px-4 py-3">PLAKA</th>
                <th className="px-4 py-3">TC / VKN</th>
                <th className="px-4 py-3">BELGE NO</th>
                <th className="px-4 py-3">ARAÇ CİNSİ</th>
                <th className="px-4 py-3">BRÜT PRİM</th>
                <th className="px-4 py-3">TÜR</th>
                <th className="px-4 py-3">KESEN</th>
                <th className="px-4 py-3">İLGİLİ KİŞİ (TALİ)</th>
                <th className="px-4 py-3">POLİÇE NO</th>
                <th className="px-4 py-3">ACENTE</th>
                <th className="px-4 py-3 text-center">KART</th>
                <th className="px-4 py-3">EK BİLGİLER / İLETİŞİM</th>
                <th className="px-4 py-3">NET PRİM</th>
                <th className="px-4 py-3">KOMİSYON</th>
                <th className="px-4 py-3 text-right">İŞLEM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={20} className="px-6 py-8 text-center text-gray-500">Yükleniyor...</td>
                </tr>
              ) : filteredPolicies.length === 0 ? (
                <tr>
                  <td colSpan={20} className="px-6 py-8 text-center text-gray-500">Kayıt bulunamadı.</td>
                </tr>
              ) : (
                filteredPolicies.map((policy) => (
                  <tr 
                    key={policy.id} 
                    className="hover:bg-blue-50 transition-colors cursor-pointer group whitespace-nowrap"
                    onClick={() => handleRowClick(policy)}
                  >
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.ad_soyad)} className="px-4 py-3 font-bold text-gray-900">{policy.ad_soyad || '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.dogum_tarihi ? format(new Date(policy.dogum_tarihi), 'd.MM.yyyy') : '-')} className="px-4 py-3 text-gray-600">{policy.dogum_tarihi ? format(new Date(policy.dogum_tarihi), 'd.MM.yyyy') : '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.sirket)} className="px-4 py-3 text-gray-600">{policy.sirket || '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, format(new Date(policy.tarih), 'd.MM.yyyy'))} className="px-4 py-3 text-gray-600">{format(new Date(policy.tarih), 'd.MM.yyyy')}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.sasi_no)} className="px-4 py-3 font-mono text-xs">{policy.sasi_no || '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.plaka)} className="px-4 py-3 font-bold">{policy.plaka || '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.tc_vkn)} className="px-4 py-3 font-mono">{policy.tc_vkn || '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.belge_no)} className="px-4 py-3 font-mono">{policy.belge_no || '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.arac_cinsi)} className="px-4 py-3">{policy.arac_cinsi || '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.brut_prim)} className="px-4 py-3 text-gray-600">{policy.brut_prim ? `₺${Number(policy.brut_prim).toLocaleString('tr-TR')}` : '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.tur)} className="px-4 py-3">{policy.tur || '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, (policy.kesen as any)?.name)} className="px-4 py-3 text-gray-600">{(policy.kesen as any)?.name || 'Bilinmiyor'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.tali || (policy.ilgili_kisi as any)?.name || (policy.misafir_bilgi as any)?.group_name)} className="px-4 py-3 text-blue-600 font-medium">
                        {policy.tali || (policy.ilgili_kisi as any)?.name || (policy.misafir_bilgi as any)?.group_name || 'Bilinmiyor'}
                    </td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.police_no)} className="px-4 py-3 font-mono text-blue-600">{policy.police_no || '-'}</td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.acente)} className="px-4 py-3 text-gray-600">{policy.acente || '-'}</td>
                    <td className="px-4 py-3 text-center">
                        {policy.kart_bilgisi ? (
                            policy.kart_bilgisi.startsWith('http') ? (
                                <a href={policy.kart_bilgisi} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-500 hover:text-blue-700" title="Görüntüle">
                                    <Eye size={18} />
                                </a>
                            ) : (
                                <span onContextMenu={(e) => handleCellContextMenu(e, policy.kart_bilgisi)} className="text-xs font-medium text-gray-700">{policy.kart_bilgisi}</span>
                            )
                        ) : '-'}
                    </td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.ek_bilgiler)} className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                        {policy.ek_bilgiler || '-'}
                    </td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.net_prim)} className="px-4 py-3 font-bold text-gray-700">
                      ₺{Number(policy.net_prim || 0).toLocaleString('tr-TR')}
                    </td>
                    <td onContextMenu={(e) => handleCellContextMenu(e, policy.komisyon)} className="px-4 py-3 text-green-600 font-medium">
                        {policy.komisyon ? `₺${Number(policy.komisyon).toLocaleString('tr-TR')}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MoreVertical size={18} className="text-gray-400 group-hover:text-blue-600" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
