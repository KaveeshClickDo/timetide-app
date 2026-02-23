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
        <div className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-ocean-500 shadow-lg flex items-center justify-center">
          <div className="w-3 h-3 border-2 border-white rounded-sm" />
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
}: EmbedCodeGeneratorProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('select')
  const [selectedType, setSelectedType] = useState<EmbedType>('inline')
  const [copied, setCopied] = useState(false)
  const [buttonText, setButtonText] = useState('Schedule a meeting')
  const [linkText, setLinkText] = useState('Schedule a meeting')
  const [buttonColor, setButtonColor] = useState('#0ea5e9')
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
  var btn = document.createElement('div');
  btn.id = 'timetide-widget-btn';
  btn.innerHTML = '${buttonText}';
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;background:${buttonColor};color:#fff;padding:14px 24px;border-radius:50px;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,0.15);z-index:9998;transition:transform 0.2s,box-shadow 0.2s;';
  btn.onmouseover = function() { btn.style.transform='scale(1.05)'; btn.style.boxShadow='0 6px 20px rgba(0,0,0,0.2)'; };
  btn.onmouseout = function() { btn.style.transform='scale(1)'; btn.style.boxShadow='0 4px 14px rgba(0,0,0,0.15)'; };

  var overlay = document.createElement('div');
  overlay.id = 'timetide-widget-overlay';
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
  document.body.appendChild(btn);
  document.body.appendChild(overlay);

  var style = document.createElement('style');
  style.textContent = '@keyframes timetide-slide-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);

  btn.onclick = function() { overlay.style.display='flex'; };
  close.onclick = function() { overlay.style.display='none'; };
  overlay.onclick = function(e) { if(e.target===overlay) overlay.style.display='none'; };
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
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Button color</Label>
                    <div className="flex gap-2 mt-1.5">
                      <input
                        type="color"
                        value={buttonColor}
                        onChange={(e) => setButtonColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                      />
                      <Input
                        value={buttonColor}
                        onChange={(e) => setButtonColor(e.target.value)}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
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
                  {selectedType === 'popup-widget' && 'This adds a floating button in the bottom-right corner of your site. Clicking it opens a booking popup.'}
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
