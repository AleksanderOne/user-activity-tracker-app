"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Bell, Settings, User, Search, Menu, Heart, Star, 
  ShoppingCart, Send, Download, Upload, Plus, Minus,
  ChevronRight, ExternalLink, Copy, Trash2, Edit,
  FileText, Image, Video, Music, Calendar, Clock,
  CreditCard, Lock, Mail, Phone, MapPin, AlertCircle
} from "lucide-react";

export default function DemoPage() {
  // Stany dla różnych komponentów
  const [progress, setProgress] = useState(33);
  const [sliderValue, setSliderValue] = useState([50]);
  const [switchEnabled, setSwitchEnabled] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    country: "",
    subscribe: false,
    notifications: "all",
  });

  // Symulacja reklamy
  const [showAd, setShowAd] = useState(true);

  // Obsługa formularza
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Formularz wysłany!", {
      description: "Twoje dane zostały zapisane.",
    });
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Pasek nawigacji */}
        <nav className="sticky top-0 z-50 border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white md:hidden">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="bg-slate-900 text-white">
                    <SheetHeader>
                      <SheetTitle className="text-white">Menu</SheetTitle>
                      <SheetDescription className="text-slate-400">
                        Nawigacja po stronie demo
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-8 flex flex-col gap-2">
                      <Button variant="ghost" className="justify-start text-white">Strona główna</Button>
                      <Button variant="ghost" className="justify-start text-white">Produkty</Button>
                      <Button variant="ghost" className="justify-start text-white">O nas</Button>
                      <Button variant="ghost" className="justify-start text-white">Kontakt</Button>
                    </div>
                  </SheetContent>
                </Sheet>
                
                <h1 className="text-xl font-bold text-white">🚀 Tracker Demo</h1>
                
                <div className="hidden gap-2 md:flex">
                  <Button variant="ghost" className="text-white/70 hover:text-white">Strona główna</Button>
                  <Button variant="ghost" className="text-white/70 hover:text-white">Produkty</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="text-white/70 hover:text-white">
                        Więcej <ChevronRight className="ml-1 h-4 w-4 rotate-90" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>Kategorie</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem><FileText className="mr-2 h-4 w-4" /> Dokumenty</DropdownMenuItem>
                      <DropdownMenuItem><Image className="mr-2 h-4 w-4" /> Zdjęcia</DropdownMenuItem>
                      <DropdownMenuItem><Video className="mr-2 h-4 w-4" /> Wideo</DropdownMenuItem>
                      <DropdownMenuItem><Music className="mr-2 h-4 w-4" /> Muzyka</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="relative hidden md:block">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input 
                    placeholder="Szukaj..." 
                    className="w-64 bg-white/10 pl-10 text-white placeholder:text-slate-400"
                  />
                </div>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative text-white">
                      <Bell className="h-5 w-5" />
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px]">3</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Masz 3 nowe powiadomienia</p>
                  </TooltipContent>
                </Tooltip>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white">
                      <ShoppingCart className="h-5 w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="grid gap-4">
                      <h4 className="font-medium">Koszyk</h4>
                      <div className="flex items-center gap-3 rounded-lg bg-slate-100 p-2">
                        <div className="h-12 w-12 rounded bg-gradient-to-br from-purple-500 to-pink-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Produkt demo</p>
                          <p className="text-xs text-slate-500">1x 99,99 zł</p>
                        </div>
                        <Button variant="ghost" size="icon-sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button className="w-full">Przejdź do kasy</Button>
                    </div>
                  </PopoverContent>
                </Popover>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white">
                      <User className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Moje konto</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem><User className="mr-2 h-4 w-4" /> Profil</DropdownMenuItem>
                    <DropdownMenuItem><Settings className="mr-2 h-4 w-4" /> Ustawienia</DropdownMenuItem>
                    <DropdownMenuItem><CreditCard className="mr-2 h-4 w-4" /> Płatności</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-500"><Lock className="mr-2 h-4 w-4" /> Wyloguj</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </nav>

        {/* Banner reklamowy */}
        {showAd && (
          <div className="relative bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 px-4 py-3 text-center text-white">
            <p className="font-medium">
              🎉 Specjalna oferta! Użyj kodu <strong>DEMO20</strong> i otrzymaj 20% zniżki! 
              <Button variant="link" className="ml-2 text-white underline">
                Skorzystaj teraz <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </p>
            <Button 
              variant="ghost" 
              size="icon-sm" 
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
              onClick={() => {
                setShowAd(false);
                toast.info("Reklama zamknięta", { description: "Nie pokaże się ponownie w tej sesji." });
              }}
            >
              ✕
            </Button>
          </div>
        )}

        <main className="mx-auto max-w-7xl px-4 py-8">
          {/* Hero Section */}
          <section className="mb-12 text-center">
            <Badge className="mb-4 bg-purple-500/20 text-purple-300">Wersja Demo</Badge>
            <h1 className="mb-4 text-5xl font-bold text-white">
              Testuj Wszystkie <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Interakcje</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-slate-300">
              Ta strona zawiera różne typy komponentów UI, które tracker automatycznie wykrywa i śledzi.
              Kliknij, przewijaj, wypełniaj formularze - wszystko jest rejestrowane!
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                    Otwórz Modal
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Modal Dialog</DialogTitle>
                    <DialogDescription>
                      Ten modal jest automatycznie wykrywany przez tracker.
                      Wszystkie interakcje wewnątrz modala są śledzone.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <Input placeholder="Wpisz coś tutaj..." />
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => toast("Kliknięto przycisk w modalu!")}>
                        Akcja 1
                      </Button>
                      <Button onClick={() => toast.success("Sukces!")}>
                        Akcja 2
                      </Button>
                    </div>
                  </div>
                  <DialogFooter showCloseButton>
                    <Button onClick={() => toast.success("Zapisano!")}>Zapisz</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                    Otwórz Alert
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Czy jesteś pewien?</AlertDialogTitle>
                    <AlertDialogDescription>
                      To jest alert dialog. Wymagana jest akcja użytkownika przed zamknięciem.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Anuluj</AlertDialogCancel>
                    <AlertDialogAction onClick={() => toast.warning("Akcja potwierdzona!")}>
                      Potwierdź
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              
              <Button 
                size="lg" 
                variant="secondary"
                onClick={() => toast.success("Sukces!", { description: "Powiadomienie toast zostało wyświetlone." })}
              >
                Pokaż Toast
              </Button>
            </div>
          </section>

          {/* Tabs z różnymi sekcjami */}
          <Tabs defaultValue="forms" className="mb-12">
            <TabsList className="mx-auto flex w-fit">
              <TabsTrigger value="forms">Formularze</TabsTrigger>
              <TabsTrigger value="inputs">Inputy</TabsTrigger>
              <TabsTrigger value="buttons">Przyciski</TabsTrigger>
              <TabsTrigger value="cards">Karty</TabsTrigger>
            </TabsList>
            
            <TabsContent value="forms" className="mt-8">
              <Card className="mx-auto max-w-2xl bg-white/5 p-8 backdrop-blur">
                <h2 className="mb-6 text-2xl font-bold text-white">Formularz kontaktowy</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-white">Imię i nazwisko</Label>
                      <Input 
                        id="name" 
                        placeholder="Jan Kowalski"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="bg-white/10 text-white placeholder:text-slate-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-white">Email</Label>
                      <Input 
                        id="email" 
                        type="email"
                        placeholder="jan@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="bg-white/10 text-white placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-white">Telefon</Label>
                    <Input 
                      id="phone" 
                      type="tel"
                      placeholder="+48 123 456 789"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="bg-white/10 text-white placeholder:text-slate-400"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="country" className="text-white">Kraj</Label>
                    <Select 
                      value={formData.country} 
                      onValueChange={(value) => setFormData({...formData, country: value})}
                    >
                      <SelectTrigger className="bg-white/10 text-white">
                        <SelectValue placeholder="Wybierz kraj" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pl">🇵🇱 Polska</SelectItem>
                        <SelectItem value="de">🇩🇪 Niemcy</SelectItem>
                        <SelectItem value="uk">🇬🇧 Wielka Brytania</SelectItem>
                        <SelectItem value="us">🇺🇸 USA</SelectItem>
                        <SelectItem value="fr">🇫🇷 Francja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-white">Wiadomość</Label>
                    <Textarea 
                      id="message"
                      placeholder="Napisz swoją wiadomość..."
                      value={formData.message}
                      onChange={(e) => setFormData({...formData, message: e.target.value})}
                      className="min-h-[120px] bg-white/10 text-white placeholder:text-slate-400"
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <Label className="text-white">Preferencje powiadomień</Label>
                    <RadioGroup 
                      value={formData.notifications}
                      onValueChange={(value) => setFormData({...formData, notifications: value})}
                      className="flex flex-col gap-3"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="all" id="notif-all" />
                        <Label htmlFor="notif-all" className="text-slate-300">Wszystkie powiadomienia</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="important" id="notif-important" />
                        <Label htmlFor="notif-important" className="text-slate-300">Tylko ważne</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="none" id="notif-none" />
                        <Label htmlFor="notif-none" className="text-slate-300">Brak powiadomień</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="subscribe"
                      checked={formData.subscribe}
                      onCheckedChange={(checked) => setFormData({...formData, subscribe: checked as boolean})}
                    />
                    <Label htmlFor="subscribe" className="text-slate-300">
                      Chcę otrzymywać newsletter
                    </Label>
                  </div>
                  
                  <Button type="submit" className="w-full bg-gradient-to-r from-purple-500 to-pink-500">
                    <Send className="mr-2 h-4 w-4" /> Wyślij formularz
                  </Button>
                </form>
              </Card>
            </TabsContent>
            
            <TabsContent value="inputs" className="mt-8">
              <Card className="mx-auto max-w-2xl bg-white/5 p-8 backdrop-blur">
                <h2 className="mb-6 text-2xl font-bold text-white">Różne typy inputów</h2>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-white">Tekst</Label>
                    <Input placeholder="Zwykły input tekstowy" className="bg-white/10 text-white" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-white">Hasło</Label>
                    <Input type="password" placeholder="••••••••" className="bg-white/10 text-white" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-white">Liczba</Label>
                    <Input type="number" placeholder="0" className="bg-white/10 text-white" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-white">Data</Label>
                    <Input type="date" className="bg-white/10 text-white" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-white">Czas</Label>
                    <Input type="time" className="bg-white/10 text-white" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-white">Kolor</Label>
                    <Input type="color" defaultValue="#8b5cf6" className="h-12 w-full bg-white/10" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-white">Plik</Label>
                    <Input type="file" className="bg-white/10 text-white file:bg-purple-500 file:text-white" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-white">Zakres (Range)</Label>
                    <Input type="range" className="bg-white/10" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-white">Slider: {sliderValue[0]}%</Label>
                    <Slider 
                      value={sliderValue} 
                      onValueChange={setSliderValue}
                      max={100}
                      step={1}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-white">Switch</Label>
                    <Switch 
                      checked={switchEnabled}
                      onCheckedChange={setSwitchEnabled}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-white">Progress: {progress}%</Label>
                      <div className="flex gap-2">
                        <Button size="icon-sm" variant="outline" onClick={() => setProgress(Math.max(0, progress - 10))}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Button size="icon-sm" variant="outline" onClick={() => setProgress(Math.min(100, progress + 10))}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Progress value={progress} />
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            <TabsContent value="buttons" className="mt-8">
              <Card className="mx-auto max-w-2xl bg-white/5 p-8 backdrop-blur">
                <h2 className="mb-6 text-2xl font-bold text-white">Różne warianty przycisków</h2>
                
                <div className="space-y-6">
                  <div>
                    <Label className="mb-3 block text-white">Warianty</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button>Default</Button>
                      <Button variant="secondary">Secondary</Button>
                      <Button variant="outline">Outline</Button>
                      <Button variant="ghost">Ghost</Button>
                      <Button variant="destructive">Destructive</Button>
                      <Button variant="link">Link</Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="mb-3 block text-white">Rozmiary</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="xs">Extra Small</Button>
                      <Button size="sm">Small</Button>
                      <Button size="default">Default</Button>
                      <Button size="lg">Large</Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="mb-3 block text-white">Z ikonami</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button><Heart className="mr-2 h-4 w-4" /> Polub</Button>
                      <Button variant="outline"><Star className="mr-2 h-4 w-4" /> Oceń</Button>
                      <Button variant="secondary"><Download className="mr-2 h-4 w-4" /> Pobierz</Button>
                      <Button variant="ghost"><Upload className="mr-2 h-4 w-4" /> Wyślij</Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="mb-3 block text-white">Icon buttons</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button size="icon"><Heart className="h-4 w-4" /></Button>
                      <Button size="icon" variant="outline"><Star className="h-4 w-4" /></Button>
                      <Button size="icon" variant="secondary"><Copy className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost"><Edit className="h-4 w-4" /></Button>
                      <Button size="icon" variant="destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="mb-3 block text-white">Akcje z toastami</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => toast.success("Sukces!", { description: "Operacja zakończona pomyślnie." })}>
                        Toast Success
                      </Button>
                      <Button variant="destructive" onClick={() => toast.error("Błąd!", { description: "Coś poszło nie tak." })}>
                        Toast Error
                      </Button>
                      <Button variant="outline" onClick={() => toast.warning("Uwaga!", { description: "Sprawdź swoje dane." })}>
                        Toast Warning
                      </Button>
                      <Button variant="secondary" onClick={() => toast.info("Info", { description: "To jest informacja." })}>
                        Toast Info
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={() => {
                          const promise = new Promise((resolve) => setTimeout(resolve, 2000));
                          toast.promise(promise, {
                            loading: "Ładowanie...",
                            success: "Załadowano!",
                            error: "Błąd ładowania",
                          });
                        }}
                      >
                        Toast Loading
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            <TabsContent value="cards" className="mt-8">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="group cursor-pointer overflow-hidden bg-white/5 backdrop-blur transition-all hover:bg-white/10 hover:scale-[1.02]">
                    <div className="aspect-video bg-gradient-to-br from-purple-500/50 to-pink-500/50 p-6">
                      <Badge className="bg-white/20">Produkt #{i}</Badge>
                    </div>
                    <div className="p-6">
                      <h3 className="mb-2 text-lg font-semibold text-white">Karta produktu {i}</h3>
                      <p className="mb-4 text-sm text-slate-400">
                        Kliknij w kartę aby zobaczyć szczegóły. Tracker śledzi wszystkie interakcje.
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold text-purple-400">{(i * 49.99).toFixed(2)} zł</span>
                        <div className="flex gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon-sm" variant="ghost" className="text-white/60 hover:text-white">
                                <Heart className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Dodaj do ulubionych</TooltipContent>
                          </Tooltip>
                          <Button size="sm" className="bg-purple-500 hover:bg-purple-600">
                            <ShoppingCart className="mr-1 h-3 w-3" /> Kup
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Accordion / FAQ */}
          <section className="mb-12">
            <h2 className="mb-6 text-center text-3xl font-bold text-white">Często zadawane pytania</h2>
            <Card className="mx-auto max-w-2xl bg-white/5 p-6 backdrop-blur">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger className="text-white hover:text-purple-400">
                    Jak działa tracker?
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-300">
                    Tracker automatycznie wykrywa i śledzi wszystkie interakcje użytkownika na stronie,
                    w tym kliknięcia, scrollowanie, wypełnianie formularzy, otwieranie modali i wiele więcej.
                    Nie wymaga żadnej manualnej konfiguracji.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger className="text-white hover:text-purple-400">
                    Jakie dane są zbierane?
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-300">
                    Zbieramy informacje o urządzeniu, przeglądarce, lokalizacji geograficznej (na podstawie IP),
                    oraz wszystkich interakcjach z interfejsem. Dane wrażliwe (hasła, numery kart) są automatycznie
                    filtrowane i nie są zapisywane.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger className="text-white hover:text-purple-400">
                    Czy to jest zgodne z GDPR?
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-300">
                    Tak! IP jest hashowane, a dane są anonimizowane. Tracker jest zaprojektowany z myślą
                    o prywatności użytkowników i spełnia wymogi GDPR.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-4">
                  <AccordionTrigger className="text-white hover:text-purple-400">
                    Jak zintegrować tracker z moją stroną?
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-300">
                    Wystarczy dodać jeden skrypt do strony:
                    <code className="mt-2 block rounded bg-black/30 p-2 text-xs text-green-400">
                      {`<script src="/tracker.js" data-site-id="twoja-strona"></script>`}
                    </code>
                    To wszystko! Tracker automatycznie zacznie zbierać dane.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Card>
          </section>

          {/* Sekcja kontaktowa */}
          <section className="mb-12">
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="bg-white/5 p-6 text-center backdrop-blur">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20">
                  <Mail className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">Email</h3>
                <a href="mailto:kontakt@example.com" className="text-purple-400 hover:underline">
                  kontakt@example.com
                </a>
              </Card>
              <Card className="bg-white/5 p-6 text-center backdrop-blur">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20">
                  <Phone className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">Telefon</h3>
                <a href="tel:+48123456789" className="text-purple-400 hover:underline">
                  +48 123 456 789
                </a>
              </Card>
              <Card className="bg-white/5 p-6 text-center backdrop-blur">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20">
                  <MapPin className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">Adres</h3>
                <p className="text-slate-400">ul. Przykładowa 123, Warszawa</p>
              </Card>
            </div>
          </section>

          {/* Footer info */}
          <div className="rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 p-8 text-center backdrop-blur">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-purple-400" />
            <h3 className="mb-2 text-xl font-bold text-white">
              Wszystkie interakcje są śledzone!
            </h3>
            <p className="text-slate-300">
              Otwórz konsolę przeglądarki (F12) i zobacz logi trackera, lub przejdź do{" "}
              <a href="/dashboard" className="text-purple-400 hover:underline">Dashboardu</a>{" "}
              aby zobaczyć zebrane dane.
            </p>
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-12 border-t border-white/10 bg-black/20 px-4 py-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 md:grid-cols-4">
              <div>
                <h4 className="mb-4 font-bold text-white">Tracker Demo</h4>
                <p className="text-sm text-slate-400">
                  Demonstracja możliwości automatycznego śledzenia aktywności użytkowników.
                </p>
              </div>
              <div>
                <h4 className="mb-4 font-bold text-white">Linki</h4>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li><a href="/dashboard" className="hover:text-white">Dashboard</a></li>
                  <li><a href="#" className="hover:text-white">Dokumentacja</a></li>
                  <li><a href="#" className="hover:text-white">API</a></li>
                </ul>
              </div>
              <div>
                <h4 className="mb-4 font-bold text-white">Społeczność</h4>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li><a href="#" className="hover:text-white">GitHub</a></li>
                  <li><a href="#" className="hover:text-white">Discord</a></li>
                  <li><a href="#" className="hover:text-white">Twitter</a></li>
                </ul>
              </div>
              <div>
                <h4 className="mb-4 font-bold text-white">Newsletter</h4>
                <div className="flex gap-2">
                  <Input placeholder="Twój email" className="bg-white/10 text-white" />
                  <Button className="bg-purple-500">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-8 border-t border-white/10 pt-8 text-center text-sm text-slate-400">
              © 2024 Activity Tracker Demo. Wszystkie prawa zastrzeżone.
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}

