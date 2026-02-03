import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, Car, Heart, Home, Briefcase, Plane, AlertTriangle, 
  ChevronRight, Check, X, Phone, Mail, MapPin, Menu, Star, 
  ArrowRight, Activity, Calculator, User, FileText, Anchor, Truck, Scale
} from 'lucide-react';

// --- DATA & CONSTANTS ---

const PRODUCTS = [
  {
    id: 'trafik',
    title: 'Zorunlu Trafik Sigortası',
    shortDescription: 'Aracınızla karşı tarafa verebileceğiniz zararları güvence altına alır.',
    icon: 'Car',
    color: 'bg-blue-50 text-blue-600',
    requiredFields: ['plaka', 'tcNo', 'ruhsatSeriNo']
  },
  {
    id: 'kasko',
    title: 'Kasko Sigortası',
    shortDescription: 'Aracınızı çarpma, çalınma, yanma ve doğal afetlere karşı korur.',
    icon: 'Shield',
    color: 'bg-indigo-50 text-indigo-600',
    requiredFields: ['plaka', 'modelYili', 'marka', 'model']
  },
  {
    id: 'saglik',
    title: 'Bireysel Sağlık Sigortası',
    shortDescription: 'Özel hastanelerde ayakta ve yatarak tedavi masraflarınızı karşılar.',
    icon: 'Heart',
    color: 'bg-red-50 text-red-600',
    requiredFields: ['yas', 'tcNo', 'cinsiyet', 'il']
  },
  {
    id: 'konut',
    title: 'Konut Sigortası',
    shortDescription: 'Evinizi ve eşyalarınızı yangın, hırsızlık ve su baskınına karşı korur.',
    icon: 'Home',
    color: 'bg-orange-50 text-orange-600',
    requiredFields: ['il', 'ilce', 'metrekare', 'binaYasi']
  },
  {
    id: 'dask',
    title: 'DASK (Zorunlu Deprem)',
    shortDescription: 'Binanızın deprem ve deprem kaynaklı hasarlarını karşılar.',
    icon: 'Activity',
    color: 'bg-emerald-50 text-emerald-600',
    requiredFields: ['adresKodu', 'il', 'ilce', 'tcNo']
  },
  {
    id: 'isyeri',
    title: 'İşyeri Sigortası',
    shortDescription: 'İşyerinizi, demirbaşlarınızı ve ticari mallarınızı risklere karşı korur.',
    icon: 'Briefcase',
    color: 'bg-slate-50 text-slate-600',
    requiredFields: ['faaliyetAlani', 'calisanSayisi', 'il']
  },
  {
    id: 'seyahat',
    title: 'Seyahat Sigortası',
    shortDescription: 'Yurt içi ve yurt dışı seyahatlerinizde sağlık ve bagaj risklerini kapsar.',
    icon: 'Plane',
    color: 'bg-sky-50 text-sky-600',
    requiredFields: ['gidilecekUlke', 'seyahatTarihi', 'yas']
  },
  {
    id: 'ferdi-kaza',
    title: 'Ferdi Kaza Sigortası',
    shortDescription: 'Beklenmedik kazalara karşı sizi ve sevdiklerinizi maddi güvenceye alır.',
    icon: 'AlertTriangle',
    color: 'bg-yellow-50 text-yellow-600',
    requiredFields: ['meslek', 'yas', 'teminatTutari']
  },
  {
    id: 'nakliyat',
    title: 'Nakliyat Sigortası',
    shortDescription: 'Yüklerinizin taşınma sırasında uğrayabileceği hasarları teminat altına alır.',
    icon: 'Truck',
    color: 'bg-amber-50 text-amber-600',
    requiredFields: ['yukCinsi', 'tasimaSekli', 'baslangicBitis']
  }
];

const FAQS = [
  {
    q: "Zorunlu Trafik Sigortası ile Kasko arasındaki fark nedir?",
    a: "Trafik sigortası zorunludur ve karşı tarafa verdiğiniz zararları karşılar. Kasko ise isteğe bağlıdır ve kendi aracınızın hasarlarını (çarpma, çalınma, sel vb.) öder."
  },
  {
    q: "Online poliçe teklifi ne kadar sürede çıkar?",
    a: "Bilgilerinizi girdikten sonra sistemimiz saniyeler içinde birden fazla sigorta şirketinden karşılaştırmalı teklifleri ekranınıza getirir."
  },
  {
    q: "Hasar anında ne yapmalıyım?",
    a: "7/24 hasar destek hattımızı arayabilir veya mobil uygulamamız üzerinden kaza tutanağı ve fotoğrafları yükleyerek hasar dosyanızı anında açabilirsiniz."
  },
  {
    q: "Özel Sağlık Sigortası doğum masraflarını karşılar mı?",
    a: "Poliçe kapsamınıza göre değişmekle birlikte, doğum teminatı eklenmiş poliçelerde bekleme süresi sonrasında doğum masrafları karşılanmaktadır."
  },
  {
    q: "DASK yaptırmak zorunlu mudur?",
    a: "Evet, 6305 sayılı Afet Sigortaları Kanunu gereğince tapusu olan tüm konutlar için Zorunlu Deprem Sigortası (DASK) yaptırılması zorunludur."
  },
  {
    q: "Ödemeleri taksitle yapabilir miyim?",
    a: "Evet, anlaşmalı kredi kartlarına vade farksız 9 taksite kadar ödeme imkanı sunuyoruz."
  }
];

// --- HELPER COMPONENTS ---

const Icon = ({ name, className }: { name: string, className?: string }) => {
  const icons: any = {
    Shield, Car, Heart, Home, Briefcase, Plane, AlertTriangle, 
    Truck, Anchor, Scale, Activity, FileText
  };
  const LucideIcon = icons[name] || Shield;
  return <LucideIcon className={className} />;
};

const AnimatedNumber = ({ value }: { value: number }) => {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className="font-bold text-3xl text-blue-600"
    >
      {value}+
    </motion.span>
  );
};

// --- MAIN COMPONENT ---

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quoteStep, setQuoteStep] = useState(0);
  const [quoteData, setQuoteData] = useState<any>({});
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [tcValue, setTcValue] = useState('');

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const openQuoteModal = (productId: string | null = null) => {
    setQuoteData(productId ? { product: productId } : {});
    setQuoteStep(productId ? 1 : 0);
    setIsQuoteModalOpen(true);
    setTcValue(''); // Reset TC value
    document.body.style.overflow = 'hidden';
  };

  const closeQuoteModal = () => {
    setIsQuoteModalOpen(false);
    setQuoteStep(0);
    setQuoteData({});
    setTcValue('');
    document.body.style.overflow = 'unset';
  };

  const handleQuoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quoteStep < 3) {
      setQuoteStep(quoteStep + 1);
    } else {
      // Final submit handled in step 3 button
      closeQuoteModal();
    }
  };

  const handleInvalid = (e: React.FormEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.preventDefault();
    const target = e.target as HTMLInputElement;
    target.setCustomValidity('Lütfen bu alanı doldurunuz.');
  };

  const handleInput = (e: React.FormEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    target.setCustomValidity(''); // Clear error when user starts typing
  };

  const handleDateInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, ''); // Sadece rakamları al
    if (val.length > 8) val = val.slice(0, 8); // Max 8 karakter (ddMMyyyy)
    
    // Otomatik nokta koyma mantığı
    if (val.length > 4) {
      val = `${val.slice(0, 2)}.${val.slice(2, 4)}.${val.slice(4)}`;
    } else if (val.length > 2) {
      val = `${val.slice(0, 2)}.${val.slice(2)}`;
    }
    
    e.target.value = val;
    handleInput(e); // Hata mesajını temizle
  };

  const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 11) val = val.slice(0, 11);
    e.target.value = val;
    handleInput(e);
  };

  const handleTcInput = (e: React.FormEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    const val = target.value.replace(/\D/g, '').slice(0, 11);
    target.value = val;
    setTcValue(val);
    handleInput(e);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-blue-100">
      
      {/* --- NAVIGATION --- */}
      <nav className={`fixed w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-white/90 backdrop-blur-md shadow-sm py-3' : 'bg-transparent py-5'}`}>
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Shield size={24} strokeWidth={2.5} />
            </div>
            <span className={`text-2xl font-bold tracking-tight ${isScrolled ? 'text-slate-900' : 'text-slate-900 lg:text-white'}`}>
              KOÇ SİGORTACILIK
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-8">
            {['Ürünler', 'Hakkımızda', 'Nasıl Çalışır?', 'SSS', 'İletişim'].map((item) => (
              <a 
                key={item} 
                href={`#${item.toLowerCase().replace(/ /g, '-').replace('?', '')}`} 
                className={`text-sm font-medium hover:text-blue-500 transition-colors ${isScrolled ? 'text-slate-600' : 'text-white/90 hover:text-white'}`}
              >
                {item}
              </a>
            ))}
            <button 
              onClick={() => openQuoteModal()}
              className={`px-5 py-2.5 rounded-full font-semibold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 ${
                isScrolled 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-white text-blue-600 hover:bg-blue-50'
              }`}
            >
              Hızlı Teklif Al
            </button>
          </div>

          <button 
            className="lg:hidden p-2 text-slate-600"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-white pt-24 px-6 lg:hidden"
          >
            <div className="flex flex-col gap-6 text-lg font-medium">
              {['Ürünler', 'Hakkımızda', 'Nasıl Çalışır?', 'SSS', 'İletişim'].map((item) => (
                <a key={item} href="#" onClick={() => setMobileMenuOpen(false)}>{item}</a>
              ))}
              <button 
                onClick={() => { setMobileMenuOpen(false); openQuoteModal(); }}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold mt-4"
              >
                Hızlı Teklif Al
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- HERO SECTION --- */}
      <header className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-600/20 to-transparent blur-3xl"></div>
        
        <div className="container mx-auto px-4 relative z-10 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-sm font-medium mb-6">
              <Star size={14} className="fill-blue-200" />
              Geleceğiniz İçin En Doğru Tercih
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold leading-tight mb-6">
              Geleceğinizi <span className="text-blue-400">Güvence</span> Altına Alın
            </h1>
            <p className="text-lg text-blue-100/80 mb-8 max-w-lg leading-relaxed">
              Trafik, Kasko, Sağlık, Konut ve diğer tüm sigorta ihtiyaçlarınız için en uygun teklifleri anında karşılaştırın. Koç Sigortacılık güvencesiyle tanışın.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => openQuoteModal()}
                className="px-8 py-4 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                Hemen Teklif Al <ArrowRight size={20} />
              </button>
              <button 
                onClick={() => document.getElementById('ürünler')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl font-bold text-lg transition-all backdrop-blur-sm"
              >
                Ürünleri İncele
              </button>
            </div>
            
            <div className="mt-10 flex items-center gap-6 text-sm text-blue-200/60">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-green-400" /> 7/24 Destek
              </div>
              <div className="flex items-center gap-2">
                <Check size={16} className="text-green-400" /> En İyi Fiyat Garantisi
              </div>
              <div className="flex items-center gap-2">
                <Check size={16} className="text-green-400" /> 20+ Sigorta Şirketi
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            {/* Abstract 3D illustration placeholder */}
            <div className="relative w-full aspect-square max-w-lg mx-auto">
              <div className="absolute inset-0 bg-blue-500/30 rounded-full blur-[100px] animate-pulse"></div>
              {/* Reliable Unsplash Image */}
              <img 
                src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=1000&auto=format&fit=crop" 
                alt="Koç Sigortacılık Güvencesi" 
                className="relative z-10 w-full h-full object-contain drop-shadow-2xl animate-float rounded-2xl"
                style={{ animation: 'float 6s ease-in-out infinite' }}
              />
              
              {/* Floating Cards */}
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute top-10 right-0 bg-white p-4 rounded-2xl shadow-xl z-20 flex items-center gap-3 max-w-[200px]"
              >
                <div className="bg-green-100 p-2 rounded-lg text-green-600"><Check size={20} /></div>
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Kasko Onaylandı</p>
                  <p className="text-sm font-bold text-slate-800">34 AB 123</p>
                </div>
              </motion.div>

              <motion.div 
                animate={{ y: [0, 15, 0] }}
                transition={{ duration: 5, repeat: Infinity, delay: 1 }}
                className="absolute bottom-20 left-0 bg-white p-4 rounded-2xl shadow-xl z-20 flex items-center gap-3"
              >
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Shield size={20} /></div>
                <div>
                  <p className="text-xs text-slate-500 font-semibold">Müşteri Memnuniyeti</p>
                  <div className="flex text-yellow-400 text-xs mt-1">
                    <Star size={12} fill="currentColor" />
                    <Star size={12} fill="currentColor" />
                    <Star size={12} fill="currentColor" />
                    <Star size={12} fill="currentColor" />
                    <Star size={12} fill="currentColor" />
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
        
        {/* Curve Separator */}
        <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-[0]">
          <svg className="relative block w-full h-[60px]" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" className="fill-white"></path>
          </svg>
        </div>
      </header>

      {/* --- STATS SECTION --- */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { label: 'Mutlu Müşteri', value: 15000 },
              { label: 'Yıllık Poliçe', value: 24000 },
              { label: 'Anlaşmalı Kurum', value: 350 },
              { label: 'Yıllık Tecrübe', value: 6 },
            ].map((stat, i) => (
              <div key={i}>
                <AnimatedNumber value={stat.value} />
                <p className="text-slate-500 font-medium mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- PRODUCTS SECTION --- */}
      <section id="ürünler" className="py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-blue-600 font-bold tracking-wider uppercase text-sm">Ürünlerimiz</span>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mt-2 mb-4">
              Size Özel Sigorta Çözümleri
            </h2>
            <p className="text-slate-600 text-lg">
              Hayatın her anında karşılaşabileceğiniz risklere karşı yanınızdayız. İhtiyacınıza uygun sigortayı seçin, güvende olun.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PRODUCTS.map((product) => (
              <motion.div 
                key={product.id}
                whileHover={{ y: -5 }}
                className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all border border-slate-100 group"
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${product.color}`}>
                  <Icon name={product.icon} className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {product.title}
                </h3>
                <p className="text-slate-500 mb-6 leading-relaxed">
                  {product.shortDescription}
                </p>
                <div className="flex items-center justify-between mt-auto">
                  <button className="text-slate-600 font-semibold text-sm hover:text-blue-600 transition-colors flex items-center gap-1">
                    Detaylı Bilgi <ChevronRight size={16} />
                  </button>
                  <button 
                    onClick={() => openQuoteModal(product.id)}
                    className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors shadow-lg shadow-slate-200"
                  >
                    Teklif Al
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- HOW IT WORKS --- */}
      <section id="nasıl-çalışır" className="py-20 bg-white overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-blue-600 font-bold tracking-wider uppercase text-sm">Nasıl Çalışır?</span>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mt-2 mb-6">
                3 Adımda Sigortan Cebinde
              </h2>
              <p className="text-slate-600 text-lg mb-10">
                Karmaşık formlar ve uzun bekleme süreleri yok. Teknolojimiz sayesinde en iyi teklifi en hızlı şekilde alın.
              </p>

              <div className="space-y-8">
                {[
                  { title: "Bilgilerini Gir", desc: "Sizi ve sigortalanacak varlığı tanımamız için gerekli temel bilgileri girin.", icon: "User" },
                  { title: "Teklifleri Karşılaştır", desc: "20+ sigorta şirketinden gelen teklifleri tek ekranda karşılaştırın.", icon: "Scale" },
                  { title: "Anında Satın Al", desc: "Size en uygun poliçeyi seçin, güvenli ödeme ile anında sahip olun.", icon: "CreditCard" }
                ].map((step, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 mb-1">{step.title}</h4>
                      <p className="text-slate-500">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-purple-100 rounded-full filter blur-3xl opacity-50"></div>
              {/* Image Removed as per request to fix errors */}
            </div>
          </div>
        </div>
      </section>

      {/* --- FAQ SECTION --- */}
      <section id="sss" className="py-20 bg-slate-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900">Sıkça Sorulan Sorular</h2>
          </div>
          <div className="space-y-4">
            {FAQS.map((faq, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
                <details className="group">
                  <summary className="flex justify-between items-center p-6 cursor-pointer list-none font-semibold text-slate-800 hover:text-blue-600 transition-colors">
                    <span>{faq.q}</span>
                    <span className="transition group-open:rotate-180">
                      <ChevronRight />
                    </span>
                  </summary>
                  <div className="px-6 pb-6 text-slate-600 leading-relaxed border-t border-slate-50 pt-4">
                    {faq.a}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- CONTACT CTA --- */}
      <section id="iletişim" className="py-20 bg-blue-600 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -ml-20 -mb-20"></div>
        
        <div className="container mx-auto px-4 relative z-10 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold mb-6">Hala sorularınız mı var?</h2>
          <p className="text-blue-100 text-lg mb-10 max-w-2xl mx-auto">
            Uzman sigorta danışmanlarımız size yardımcı olmak için hazır. 
            Hafta içi 09:00 - 18:00 saatleri arasında bize ulaşabilirsiniz.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <div className="flex items-center justify-center gap-3 bg-white text-blue-600 px-8 py-4 rounded-xl font-bold shadow-lg">
              <Phone size={20} />
              +90 542 222 85 41
            </div>
            <div className="flex items-center justify-center gap-3 bg-blue-700 text-white px-8 py-4 rounded-xl font-bold shadow-lg border border-blue-500">
              <Mail size={20} />
              kocsigorta35@gmail.com
            </div>
          </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="bg-slate-900 text-slate-300 py-16 border-t border-slate-800">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-6 text-white">
                <Shield size={24} className="text-blue-500" />
                <span className="text-xl font-bold">KOÇ SİGORTACILIK</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-400">
                Güvenilir, hızlı ve modern sigortacılık anlayışıyla 6 yıldır hizmetinizdeyiz. 
                Geleceğinizi güvence altına almak için yanınızdayız.
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-bold mb-6">Hızlı Erişim</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-blue-400 transition-colors">Ana Sayfa</a></li>
                <li><a href="#ürünler" className="hover:text-blue-400 transition-colors">Tüm Ürünler</a></li>
                <li><a href="#hakkımızda" className="hover:text-blue-400 transition-colors">Hakkımızda</a></li>
                <li><a href="#iletişim" className="hover:text-blue-400 transition-colors">İletişim</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6">Ürünler</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-blue-400 transition-colors">Trafik Sigortası</a></li>
                <li><a href="#" className="hover:text-blue-400 transition-colors">Kasko</a></li>
                <li><a href="#" className="hover:text-blue-400 transition-colors">Sağlık Sigortası</a></li>
                <li><a href="#" className="hover:text-blue-400 transition-colors">DASK</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6">İletişim</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <MapPin size={18} className="text-blue-500 shrink-0" />
                  <a href="https://maps.google.com/?q=Adalet,+Manas+Blv.+Yanyolu+No:47B,+35530+Bayraklı/İzmir" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                    Adalet, Manas Blv. Yanyolu No:47B<br />
                    A BLOK D2702<br />
                    35530 Bayraklı / İzmir
                  </a>
                </li>
                <li className="flex gap-3">
                  <Phone size={18} className="text-blue-500 shrink-0" />
                  <span className="hover:text-blue-400 transition-colors">+90 542 222 85 41</span>
                </li>
                <li className="flex gap-3">
                  <Mail size={18} className="text-blue-500 shrink-0" />
                  <span className="hover:text-blue-400 transition-colors">kocsigorta35@gmail.com</span>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
            <p>&copy; 2026 Koç Sigortacılık A.Ş. Tüm hakları saklıdır.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white">KVKK Aydınlatma Metni</a>
              <a href="#" className="hover:text-white">Gizlilik Politikası</a>
              <a href="#" className="hover:text-white">Çerez Politikası</a>
            </div>
            {/* Admin access note strictly for developers/internal use */}
            <div className="hidden">Admin & Employee portal accessible at /login</div>
          </div>
        </div>
      </footer>

      {/* --- QUICK QUOTE MODAL --- */}
      <AnimatePresence>
        {isQuoteModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeQuoteModal}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Hızlı Teklif Al</h3>
                  <div className="flex gap-2 mt-1">
                    {[1, 2, 3, 4].map(step => (
                      <div 
                        key={step} 
                        className={`h-1.5 w-8 rounded-full transition-colors ${step <= quoteStep + 1 ? 'bg-blue-600' : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                </div>
                <button 
                  onClick={closeQuoteModal}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto custom-scrollbar">
                <form onSubmit={handleQuoteSubmit}>
                  {/* STEP 1: Product Selection */}
                  {quoteStep === 0 && (
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold mb-4">Hangi ürün için teklif almak istiyorsunuz?</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {PRODUCTS.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setQuoteData({ ...quoteData, product: p.id });
                              setQuoteStep(1);
                            }}
                            className="flex flex-col items-center gap-2 p-4 border-2 border-slate-100 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group text-center"
                          >
                            <Icon name={p.icon} className="text-slate-400 group-hover:text-blue-600" />
                            <span className="font-semibold text-slate-700 group-hover:text-blue-700">{p.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STEP 2: Details */}
                  {quoteStep === 1 && (
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold mb-4">Detayları girelim</h4>
                      <p className="text-sm text-slate-500 mb-4">
                        Seçilen Ürün: <span className="font-bold text-blue-600">{PRODUCTS.find(p => p.id === quoteData.product)?.title}</span>
                      </p>
                      
                      <div className="grid gap-4">
                        {/* TC Kimlik No */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">TC Kimlik / Vergi No</label>
                          <input 
                            required 
                            type="text" 
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" 
                            placeholder="11 haneli numara"
                            maxLength={11}
                            onInvalid={handleInvalid}
                            onInput={handleTcInput}
                          />
                        </div>

                        {/* Doğum Tarihi - Sadece TC girildiyse (11 hane) göster */}
                        {tcValue.length === 11 && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }} 
                            animate={{ opacity: 1, height: 'auto' }}
                          >
                            <label className="block text-sm font-medium text-slate-700 mb-1">Doğum Tarihi / Kuruluş Yılı</label>
                            <input 
                              required 
                              type="text" 
                              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="GG.AA.YYYY"
                              onInvalid={handleInvalid}
                              onChange={handleDateInput}
                            />
                          </motion.div>
                        )}

                        {/* Telefon Numarası */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Cep Telefonu</label>
                          <input 
                            required 
                            type="tel" 
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="05XX XXX XX XX"
                            onInvalid={handleInvalid}
                            onChange={handlePhoneInput}
                          />
                        </div>

                        {/* Ürüne özel ek alanlar (Dinamik) */}
                        {quoteData.product === 'trafik' || quoteData.product === 'kasko' ? (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Plaka</label>
                            <input 
                              required 
                              type="text" 
                              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                              placeholder="34 AB 123"
                              onInvalid={handleInvalid}
                              onInput={handleInput}
                            />
                          </div>
                        ) : null}

                        {quoteData.product === 'konut' || quoteData.product === 'dask' ? (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">İl / İlçe</label>
                            <input 
                              required 
                              type="text" 
                              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="Örn: İzmir / Bayraklı"
                              onInvalid={handleInvalid}
                              onInput={handleInput}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* STEP 3: Additional Info (License/Note) */}
                  {quoteStep === 2 && (
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold mb-4">Son Adım: Ek Bilgiler</h4>
                      
                      {(quoteData.product === 'trafik' || quoteData.product === 'kasko') && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Ruhsat Fotoğrafı Yükle (Opsiyonel)</label>
                          <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer group">
                            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600 group-hover:scale-110 transition-transform">
                              <FileText size={24} />
                            </div>
                            <span className="text-sm text-slate-500 font-medium">Fotoğraf seçmek için tıklayın veya sürükleyin</span>
                            <input type="file" className="hidden" accept="image/*,.pdf" />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Varsa Eklemek İstedikleriniz (Not)</label>
                        <textarea 
                          className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none"
                          placeholder="Örn: Özellikle cam teminatı istiyorum..."
                        ></textarea>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-1">İletişim İçin Telefon</label>
                          <input 
                            required 
                            type="tel" 
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" 
                            placeholder="05XX XXX XX XX" 
                            onInvalid={handleInvalid}
                            onChange={handlePhoneInput}
                          />
                        </div>
                        <div className="sm:col-span-2 flex items-start gap-2 mt-2">
                          <input 
                            required 
                            type="checkbox" 
                            className="mt-1"
                            onInvalid={handleInvalid}
                            onInput={handleInput} 
                          />
                          <span className="text-xs text-slate-500">
                            KVKK kapsamında kişisel verilerimin işlenmesine izin veriyorum.
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 4: Confirmation */}
                  {quoteStep === 3 && (
                    <div className="text-center py-8">
                      <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
                        <Check size={40} />
                      </div>
                      <h4 className="text-xl font-bold text-slate-900 mb-4">Bilgileriniz İletildi! 🎉</h4>
                      <p className="text-slate-600 mb-8 max-w-sm mx-auto leading-relaxed">
                        Talebiniz uzman sigorta danışmanlarımıza başarıyla ulaştı. 
                        En kısa sürede sizinle iletişime geçerek, size özel en uygun teklifi sunacağız.
                      </p>
                      <div className="bg-blue-50 p-4 rounded-xl text-blue-800 text-sm font-medium">
                        Bizi tercih ettiğiniz için teşekkür ederiz.
                      </div>
                    </div>
                  )}

                  {/* Footer Actions */}
                  {quoteStep < 3 && (
                    <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between">
                      {quoteStep > 0 ? (
                        <button 
                          type="button"
                          onClick={() => setQuoteStep(quoteStep - 1)}
                          className="px-6 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          Geri
                        </button>
                      ) : (
                        <div></div>
                      )}
                      <button 
                        type="submit"
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all"
                      >
                        {quoteStep === 2 ? 'Teklifi Gönder' : 'Devam Et'}
                      </button>
                    </div>
                  )}
                  {quoteStep === 3 && (
                    <div className="mt-8 pt-6 border-t border-slate-100 flex justify-center">
                      <button 
                        type="button"
                        onClick={closeQuoteModal}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all"
                      >
                        Tamam
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
}
