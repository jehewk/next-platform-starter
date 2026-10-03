/**
 * KVKK metinleri — Aydınlatma Metni, yurt dışına aktarım açık rızası, gizlilik ve
 * hesap silme. /gizlilik sayfası (herkese açık) ve kayıt formu buradan okur.
 *
 * ÖNEMLİ: Bu metinler bir taslaktır; yayından önce bir avukat / KVKK danışmanı
 * tarafından gözden geçirilmelidir. Şirket bilgileri .env'den gelir
 * (VITE_SIRKET_UNVAN, VITE_SIRKET_ADRES, VITE_KVKK_EPOSTA, VITE_SIRKET_MERSIS).
 *
 * Metin değişince KVKK_SURUM artırılır; kayıtta hangi sürümün onaylandığı
 * müşteri kaydına yazılır.
 */

export const KVKK_SURUM = "2026-10";

const ortam = import.meta.env;
export const SIRKET = {
  unvan: ortam.VITE_SIRKET_UNVAN || "Dennis Enerji",
  adres: ortam.VITE_SIRKET_ADRES || "",
  mersis: ortam.VITE_SIRKET_MERSIS || "",
  eposta: ortam.VITE_KVKK_EPOSTA || ortam.VITE_DESTEK_EPOSTA || "",
};

const basvuru = () => SIRKET.eposta
  ? `${SIRKET.eposta} adresine e-posta göndererek${SIRKET.adres ? ` ya da ${SIRKET.adres} adresine yazılı olarak` : ""}`
  : SIRKET.adres ? `${SIRKET.adres} adresine yazılı olarak` : "uygulamadaki Destek sekmesinden";

/**
 * Bölümler: {id, baslik, paragraflar: (string | {liste: string[]})[]}.
 * Metin içinde **kalın** kullanılabilir.
 */
export function kvkkBolumleri() {
  return [
    {
      id: "aydinlatma",
      baslik: "Kişisel Verilerin Korunması Aydınlatma Metni",
      paragraflar: [
        `Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun ("KVKK") 10. maddesi uyarınca, veri sorumlusu sıfatıyla **${SIRKET.unvan}**${SIRKET.mersis ? ` (MERSİS: ${SIRKET.mersis})` : ""}${SIRKET.adres ? `, ${SIRKET.adres}` : ""} tarafından Dennis Energy uygulaması kullanıcılarını bilgilendirmek için hazırlanmıştır.`,
        "**İşlenen kişisel verileriniz**",
        {
          liste: [
            "Kimlik: ad, soyad",
            "İletişim: e-posta adresi, telefon numarası, adres, il, ilçe, posta kodu",
            "Müşteri işlem: satın aldığınız ürün, cihaz seri numaraları, kurulum tarihi, garanti ve destek talepleriniz",
            "Cihaz kullanım verileri: akü ve inverterinizden gelen ölçümler (gerilim, akım, şarj durumu, sıcaklık, enerji üretimi), cihaz arıza ve uyarı kayıtları",
            "Konum: kurulum adresi ve haritada gösterim için adres koordinatı",
            "İşlem güvenliği: giriş kayıtları, oturum bilgileri, IP adresi",
            "Sohbet asistanı: asistana yazdığınız sorular ve gönderdiğiniz fotoğraflar",
            "Bildirim: bildirim almayı seçerseniz tarayıcınızın bildirim adresi",
          ],
        },
        "**İşleme amaçları:** hesabınızın açılması ve yönetimi; cihazlarınızın uzaktan izlenmesi, arıza ve bakım ihtiyacının öngörülmesi; garanti ve destek süreçlerinin yürütülmesi; size önemli cihaz durumlarının bildirilmesi; sorularınızın yanıtlanması; bilgi güvenliğinin sağlanması; yasal yükümlülüklerin yerine getirilmesi.",
        "**Hukuki sebepler (KVKK m.5/2):** bir sözleşmenin kurulması ve ifası (c), veri sorumlusunun hukuki yükümlülüğü (ç), bir hakkın tesisi, kullanılması veya korunması (e) ve temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatimiz (f). Sohbet asistanı için yurt dışına aktarım, aşağıdaki ayrı açık rızanıza dayanır.",
        "**Toplama yöntemi:** kayıt formu, uygulama kullanımı ve cihazlarınızın internet üzerinden otomatik olarak gönderdiği ölçümler.",
        "**Aktarım:** Verileriniz, hizmetin sunulması için kullandığımız bulut altyapı sağlayıcısı Amazon Web Services'in **Almanya (Frankfurt, Avrupa Birliği)** bölgesindeki sunucularında saklanır; bu aktarım KVKK m.9'da öngörülen güvencelere (standart sözleşme) dayanır. Sohbet asistanına yazdığınız genel sorular ve gönderdiğiniz fotoğraflar, yalnızca açık rıza vermeniz hâlinde yanıtlanmak üzere Google LLC'ye (ABD) iletilir; cihaz ölçümleriniz ve iletişim bilgileriniz Google'a gönderilmez. Kanunen yetkili kamu kurum ve kuruluşlarına, talep hâlinde ve mevzuatın izin verdiği ölçüde aktarım yapılabilir.",
        "**Saklama süreleri:** hesap bilgileriniz hesabınız açık olduğu sürece; cihaz ölçümleri 180 gün; garanti ve fatura kayıtları ilgili mevzuatta öngörülen süre boyunca (Türk Ticaret Kanunu uyarınca 10 yıla kadar) saklanır. Silinen veriler, olağan yedeklerden en geç 35 gün içinde kendiliğinden temizlenir.",
        `**Haklarınız (KVKK m.11):** kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini, silinmesini veya yok edilmesini isteme, bu işlemlerin aktarılan kişilere bildirilmesini isteme, otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme. Başvurularınızı ${basvuru()} iletebilirsiniz; en geç 30 gün içinde ücretsiz yanıtlanır.`,
      ],
    },
    {
      id: "acik-riza",
      baslik: "Yurt Dışına Aktarım Açık Rıza Metni (Sohbet Asistanı)",
      paragraflar: [
        "Uygulamadaki sohbet asistanı, sisteminizle ilgili soruları (ör. \"Akümde ne kadar enerji var?\") cihazınızda, verileriniz dışarı çıkmadan yanıtlar. **Genel sorular** (ör. \"Akü kışın nasıl korunur?\") ve asistana **gönderdiğiniz fotoğraflar** ise yanıtlanmak üzere yapay zekâ hizmet sağlayıcısı **Google LLC**'nin (Amerika Birleşik Devletleri) Gemini hizmetine iletilir.",
        "Google bu içeriği hizmetini geliştirmek için kullanabilir. Bu nedenle sorularınıza ve fotoğraflarınıza kimlik numarası, adres, yüz gibi kişisel bilgiler eklememenizi öneririz.",
        "Bu aktarım isteğe bağlıdır. Rıza vermezseniz uygulamanın tüm diğer özellikleri ve sisteminizle ilgili sohbet soruları çalışmaya devam eder; yalnızca genel sorular ve fotoğraf incelemesi kapalı kalır. Rızanızı dilediğiniz zaman **Hesabım** sayfasından geri alabilirsiniz.",
      ],
    },
    {
      id: "hesap-silme",
      baslik: "Hesabınızı ve Verilerinizi Silme",
      paragraflar: [
        "Hesabınızı uygulamada **Hesabım → Hesabımı sil** adımıyla, şifrenizi girerek dilediğiniz zaman silebilirsiniz. Silme işlemi:",
        {
          liste: [
            "Giriş hesabınızı ve ad, adres, telefon, e-posta bilgilerinizi hemen siler,",
            "Bildirim aboneliklerinizi siler,",
            "Cihazlarınızın hesabınızla bağlantısını kaldırır (cihaz kayıtları üreticiye aittir; ölçüm verileri en geç 180 gün içinde kendiliğinden silinir),",
            "Garanti ve fatura kayıtlarını, yasal saklama yükümlülüğü nedeniyle süresi dolana kadar saklar.",
          ],
        },
        `Uygulamaya erişemiyorsanız silme talebinizi ${basvuru()} iletebilirsiniz.`,
      ],
    },
  ];
}
