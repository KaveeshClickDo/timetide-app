'use client'

import { useState } from 'react'
import { Copy, Check, Code, ExternalLink, ArrowLeft, X, Monitor, MessageSquare, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface EmbedCodeGeneratorProps {
  username: string
  eventSlug: string
  eventTitle: string
  userImage?: string | null
}

type EmbedType = 'inline' | 'popup-widget' | 'popup-text'
type Step = 'select' | 'configure'

const embedOptions: {
  type: EmbedType
  title: string
  description: string
  icon: typeof Monitor
  preview: React.ReactNode
}[] = [
  {
    type: 'inline',
    title: 'Inline embed',
    description: 'Add a scheduling page to your site',
    icon: Monitor,
    preview: (
      <div className="w-full h-full bg-white rounded border border-gray-200 p-2 flex flex-col gap-1.5">
        <div className="h-1.5 w-8 bg-gray-200 rounded" />
        <div className="flex-1 rounded border-2 border-dashed border-ocean-300 bg-ocean-50/50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <div className="grid grid-cols-4 gap-0.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className={cn(
                  'w-2 h-2 rounded-sm',
                  i === 5 ? 'bg-ocean-500' : 'bg-ocean-200'
                )} />
              ))}
            </div>
            <div className="h-1 w-6 bg-ocean-300 rounded mt-0.5" />
          </div>
        </div>
        <div className="h-1.5 w-12 bg-gray-200 rounded" />
      </div>
    ),
  },
  {
    type: 'popup-widget',
    title: 'Popup widget',
    description: 'Add a floating button that opens a popup',
    icon: MessageSquare,
    preview: (
      <div className="w-full h-full bg-white rounded border border-gray-200 p-2 relative">
        <div className="space-y-1.5">
          <div className="h-1.5 w-10 bg-gray-200 rounded" />
          <div className="h-1 w-16 bg-gray-100 rounded" />
          <div className="h-1 w-14 bg-gray-100 rounded" />
          <div className="h-1 w-12 bg-gray-100 rounded" />
        </div>
        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-ocean-500 rounded-full pl-1 pr-2.5 py-1 shadow-lg">
          <div className="w-4 h-4 rounded-full bg-white/30 flex-shrink-0" />
          <div className="h-1.5 w-6 bg-white/80 rounded" />
        </div>
      </div>
    ),
  },
  {
    type: 'popup-text',
    title: 'Popup text',
    description: 'Add a text link that opens a popup',
    icon: Type,
    preview: (
      <div className="w-full h-full bg-white rounded border border-gray-200 p-2">
        <div className="space-y-1.5">
          <div className="h-1.5 w-10 bg-gray-200 rounded" />
          <div className="h-1 w-16 bg-gray-100 rounded" />
          <div className="h-1 w-14 bg-gray-100 rounded" />
          <div className="flex items-center gap-1 mt-1">
            <div className="h-1.5 w-12 bg-ocean-500 rounded" />
            <div className="h-1.5 w-1.5 bg-ocean-500 rounded-full" />
          </div>
          <div className="h-1 w-12 bg-gray-100 rounded" />
        </div>
      </div>
    ),
  },
]

export function EmbedCodeGenerator({
  username,
  eventSlug,
  eventTitle,
  userImage,
}: EmbedCodeGeneratorProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('select')
  const [selectedType, setSelectedType] = useState<EmbedType>('inline')
  const [copied, setCopied] = useState(false)
  const [buttonText, setButtonText] = useState('Schedule a meeting')
  const [linkText, setLinkText] = useState('Schedule a meeting')
  const [buttonColor, setButtonColor] = useState('#0ea5e9')
  const [buttonTextColor, setButtonTextColor] = useState('#ffffff')
  const [avatarUrl, setAvatarUrl] = useState(userImage ?? '')
  const [textColor, setTextColor] = useState('#0ea5e9')

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const bookingUrl = `${baseUrl}/${username}/${eventSlug}`

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setStep('select')
      setCopied(false)
    }
  }

  const handleSelect = (type: EmbedType) => {
    setSelectedType(type)
    setStep('configure')
    setCopied(false)
  }

  const getEmbedCode = (): string => {
    switch (selectedType) {
      case 'inline':
        return `<!-- TimeTide Inline Embed -->
<div id="timetide-embed" style="min-width:320px;height:700px;"></div>
<script>
(function() {
  var iframe = document.createElement('iframe');
  iframe.src = '${bookingUrl}?embed=true';
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  iframe.allow = 'payment';
  iframe.loading = 'lazy';
  document.getElementById('timetide-embed').appendChild(iframe);
})();
</script>`

      case 'popup-widget':
        return `<!-- TimeTide Popup Widget -->
<script>
(function() {
  var BOOKING_URL = '${bookingUrl}?embed=true';
  var BTN_BG = '${buttonColor}';
  var BTN_FG = '${buttonTextColor}';
  var AVATAR = '${avatarUrl.trim()}';
  var BTN_TEXT = '${buttonText.replace(/'/g, "\\'")}';
  var hasAvatar = AVATAR !== '';

  // --- Floating button ---
  var btn = document.createElement('div');
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;display:flex;align-items:center;gap:10px;background:'+BTN_BG+';color:'+BTN_FG+';padding:'+(hasAvatar?'8px 20px 8px 8px':'12px 22px')+';border-radius:50px;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;font-weight:600;box-shadow:0 4px 24px rgba(0,0,0,0.18),0 1px 4px rgba(0,0,0,0.08);z-index:9998;transition:transform 0.2s ease,box-shadow 0.2s ease;user-select:none;';

  if (hasAvatar) {
    var img = document.createElement('img');
    img.src = AVATAR; img.alt = '';
    img.style.cssText = 'width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.3);flex-shrink:0;display:block;';
    btn.appendChild(img);
  } else {
    var ico = document.createElement('span');
    ico.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    ico.style.cssText = 'display:flex;align-items:center;flex-shrink:0;opacity:0.9;';
    btn.appendChild(ico);
  }
  var txt = document.createElement('span');
  txt.textContent = BTN_TEXT;
  btn.appendChild(txt);

  // --- Overlay ---
  var overlay = document.createElement('div');
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;justify-content:center;align-items:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';

  // --- Popup ---
  var popup = document.createElement('div');
  popup.style.cssText = 'background:#fff;border-radius:20px;width:92%;max-width:480px;height:88vh;max-height:720px;position:relative;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.2);animation:tt-in 0.3s cubic-bezier(0.34,1.56,0.64,1);';

  var close = document.createElement('button');
  close.innerHTML = '&times;';
  close.style.cssText = 'position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.07);border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:20px;color:#555;z-index:1;display:flex;align-items:center;justify-content:center;transition:background 0.15s;';
  close.onmouseover = function() { close.style.background='rgba(0,0,0,0.13)'; };
  close.onmouseout = function() { close.style.background='rgba(0,0,0,0.07)'; };

  var iframe = document.createElement('iframe');
  iframe.src = BOOKING_URL;
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  iframe.allow = 'payment'; iframe.loading = 'lazy';

  popup.appendChild(close); popup.appendChild(iframe);
  overlay.appendChild(popup);
  document.body.appendChild(btn); document.body.appendChild(overlay);

  var s = document.createElement('style');
  s.textContent = '@keyframes tt-in{from{opacity:0;transform:scale(0.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}';
  document.head.appendChild(s);

  function openPopup() { overlay.style.display = 'flex'; }
  function closePopup() { overlay.style.display = 'none'; }

  btn.onclick = openPopup;
  close.onclick = closePopup;
  overlay.onclick = function(e) { if (e.target === overlay) closePopup(); };
  btn.onmouseover = function() { btn.style.transform='scale(1.05) translateY(-2px)'; btn.style.boxShadow='0 8px 32px rgba(0,0,0,0.22),0 2px 6px rgba(0,0,0,0.1)'; };
  btn.onmouseout = function() { btn.style.transform=''; btn.style.boxShadow='0 4px 24px rgba(0,0,0,0.18),0 1px 4px rgba(0,0,0,0.08)'; };
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closePopup(); });
})();
</script>`

      case 'popup-text':
        return `<!-- TimeTide Popup Text Link -->
<script>
(function() {
  var overlay = document.createElement('div');
  overlay.id = 'timetide-text-overlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;justify-content:center;align-items:center;';

  var popup = document.createElement('div');
  popup.style.cssText = 'background:#fff;border-radius:16px;width:90%;max-width:480px;height:85vh;max-height:750px;position:relative;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.15);animation:timetide-slide-up 0.3s ease;';

  var close = document.createElement('button');
  close.innerHTML = '&times;';
  close.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;font-size:28px;cursor:pointer;color:#64748b;z-index:1;line-height:1;padding:4px;';

  var iframe = document.createElement('iframe');
  iframe.src = '${bookingUrl}?embed=true';
  iframe.style.cssText = 'width:100%;height:100%;border:none;';

  popup.appendChild(close);
  popup.appendChild(iframe);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  var style = document.createElement('style');
  style.textContent = '@keyframes timetide-slide-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);

  overlay.onclick = function(e) { if(e.target===overlay) overlay.style.display='none'; };
  close.onclick = function() { overlay.style.display='none'; };

  window.openTimeTidePopup = function() { overlay.style.display='flex'; };
})();
</script>
<a href="javascript:void(0)" onclick="openTimeTidePopup()" style="color:${textColor};font-weight:600;text-decoration:none;border-bottom:2px solid ${textColor};padding-bottom:2px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer;">${linkText}</a>`

      default:
        return ''
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(getEmbedCode())
      setCopied(true)
      toast({
        title: 'Copied to clipboard!',
        description: 'Paste the code into your website\'s HTML.',
      })
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      })
    }
  }

  const getStepTitle = () => {
    if (step === 'select') return 'Add to website'
    switch (selectedType) {
      case 'inline': return 'Inline embed'
      case 'popup-widget': return 'Popup widget'
      case 'popup-text': return 'Popup text'
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Code className="h-4 w-4 mr-2" />
          Embed
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-[560px] p-0 gap-0 flex flex-col max-h-[85vh] sm:max-h-[90vh]">
        {/* Header - fixed */}
        <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 sm:pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 pr-6">
            {step === 'configure' && (
              <button
                onClick={() => { setStep('select'); setCopied(false) }}
                className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-gray-500" />
              </button>
            )}
            <div className="min-w-0">
              <DialogTitle className="text-base sm:text-lg font-semibold text-gray-900">
                {getStepTitle()}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2.5 h-2.5 rounded-full bg-ocean-500 flex-shrink-0" />
                <span className="text-xs sm:text-sm text-gray-500 truncate">{eventTitle}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content - scrollable */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0">
          {step === 'select' ? (
            <div className="space-y-4 sm:space-y-5">
              <p className="text-sm text-gray-600">
                How do you want to add TimeTide to your site?
              </p>

              {/* Option Cards - stack on mobile, 3 cols on sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {embedOptions.map((option) => (
                  <button
                    key={option.type}
                    onClick={() => handleSelect(option.type)}
                    className="group flex sm:flex-col items-center sm:text-center p-3 sm:p-4 rounded-xl border-2 border-gray-200 hover:border-ocean-400 hover:shadow-md transition-all duration-200 bg-white gap-3 sm:gap-0"
                  >
                    {/* Preview illustration */}
                    <div className="w-16 h-12 sm:w-full sm:aspect-[4/3] sm:mb-3 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 group-hover:border-ocean-200 transition-colors p-1 flex-shrink-0">
                      {option.preview}
                    </div>
                    <div className="text-left sm:text-center">
                      <h3 className="font-semibold text-sm text-gray-900 group-hover:text-ocean-700 transition-colors">
                        {option.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5 sm:mt-1 leading-relaxed">
                        {option.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Preview link */}
              <div className="flex items-center justify-between pt-1 sm:pt-2">
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ocean-600 hover:text-ocean-700 flex items-center gap-1.5 font-medium"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Preview booking page
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              {/* Customization options */}
              {selectedType === 'popup-widget' && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Button text</Label>
                    <Input
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                      className="mt-1.5"
                      placeholder="Schedule a meeting"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Button color</Label>
                      <div className="flex gap-2 mt-1.5">
                        <input
                          type="color"
                          value={buttonColor}
                          onChange={(e) => setButtonColor(e.target.value)}
                          className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0"
                        />
                        <Input
                          value={buttonColor}
                          onChange={(e) => setButtonColor(e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Text color</Label>
                      <div className="flex gap-2 mt-1.5">
                        <input
                          type="color"
                          value={buttonTextColor}
                          onChange={(e) => setButtonTextColor(e.target.value)}
                          className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0"
                        />
                        <Input
                          value={buttonTextColor}
                          onChange={(e) => setButtonTextColor(e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">
                      Profile image <span className="text-gray-400 font-normal">(optional)</span>
                    </Label>
                    <div className="flex gap-2 mt-1.5">
                      {avatarUrl && (
                        <img
                          src={avatarUrl}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover border border-gray-200 flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      )}
                      <Input
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        placeholder="https://example.com/your-photo.jpg"
                        className="flex-1"
                      />
                      {userImage && avatarUrl !== userImage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAvatarUrl(userImage)}
                          className="flex-shrink-0 text-xs"
                        >
                          Use mine
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">Shows a circular photo next to your button text</p>
                  </div>
                </div>
              )}

              {selectedType === 'popup-text' && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Link text</Label>
                    <Input
                      value={linkText}
                      onChange={(e) => setLinkText(e.target.value)}
                      className="mt-1.5"
                      placeholder="Schedule a meeting"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Link color</Label>
                    <div className="flex gap-2 mt-1.5">
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                      />
                      <Input
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedType === 'inline' && (
                <p className="text-sm text-gray-500">
                  Copy the code below and paste it into your website&apos;s HTML where you want the scheduling widget to appear.
                </p>
              )}

              {/* Code block */}
              <div>
                <Label className="text-sm font-medium text-gray-700">Embed code</Label>
                <div className="relative mt-1.5">
                  <pre className="p-3 sm:p-4 bg-gray-900 text-gray-300 rounded-xl text-[11px] sm:text-xs leading-relaxed max-h-32 sm:max-h-40 overflow-auto whitespace-pre-wrap break-all">
                    <code>{getEmbedCode()}</code>
                  </pre>
                </div>
              </div>

              {/* Live preview hint */}
              <div className="flex items-start gap-2.5 p-3 bg-ocean-50 rounded-xl border border-ocean-100">
                <div className="w-5 h-5 rounded-full bg-ocean-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-ocean-600 text-xs font-bold">i</span>
                </div>
                <p className="text-xs text-ocean-700 leading-relaxed">
                  {selectedType === 'inline' && 'Paste this code into your HTML where you want the calendar to appear. The widget will fill its container width.'}
                  {selectedType === 'popup-widget' && 'This adds a floating button in the bottom-right of your site. It shows your avatar (if set) next to the button text. Clicking it opens a booking popup.'}
                  {selectedType === 'popup-text' && 'Place the link anywhere in your page content. Clicking it opens a booking popup overlay.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer - Copy button (only on configure step) */}
        {step === 'configure' && (
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-2 flex-shrink-0 border-t border-gray-100 bg-white">
            <Button
              onClick={copyToClipboard}
              className={cn(
                'w-full h-11 text-sm font-semibold rounded-xl transition-all duration-200',
                copied
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-ocean-500 hover:bg-ocean-600 text-white'
              )}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied to clipboard!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy code
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
