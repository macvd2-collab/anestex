/* Anestex — service worker
   Estratégia deliberada, porque isto é um app de doses:

   • HTML (a página com a base de drogas): REDE PRIMEIRO, cache como rede de
     segurança. Com internet, você recebe a correção de dose na hora — não na
     próxima abertura. Sem internet, cai no cache e funciona igual.
   • Ícones e manifest: cache primeiro (não mudam e não têm risco clínico).
*/
var CACHE = 'anestex-v9';
var ASSETS = ['./','./index.html','./manifest.webmanifest','./icon.svg',
              './icon-180.png','./icon-192.png','./icon-512.png'];
var NET_TIMEOUT = 4000;   // se a rede demorar mais que isso, usa o cache

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.filter(function(k){ return k!==CACHE; })
                          .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function ehDocumento(req){
  return req.mode === 'navigate' ||
         (req.headers.get('accept')||'').indexOf('text/html') >= 0;
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;

  if(ehDocumento(req)){
    /* rede primeiro, com prazo — offline cai no cache sem demora perceptível */
    e.respondWith(
      new Promise(function(resolve){
        var pronto = false;
        var prazo = setTimeout(function(){
          if(!pronto){ caches.match('./index.html').then(function(c){ if(c) resolve(c); }); }
        }, NET_TIMEOUT);

        /* no-store: ignora o cache HTTP do navegador. O GitHub Pages manda
           cache-control max-age=600, o que faria uma correcao de dose demorar
           ate 10 min para aparecer mesmo com rede disponivel. */
        fetch(req.url, {cache:'no-store'}).then(function(res){
          pronto = true; clearTimeout(prazo);
          var copia = res.clone();
          caches.open(CACHE).then(function(c){
            c.put('./index.html', copia);
            try{ c.put(req, res.clone()); }catch(x){}
          });
          resolve(res);
        }).catch(function(){
          pronto = true; clearTimeout(prazo);
          caches.match('./index.html').then(function(c){
            resolve(c || new Response('Anestex indisponível e sem cópia local.',
                    {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}}));
          });
        });
      })
    );
    return;
  }

  /* demais arquivos: cache primeiro */
  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){
        var copia = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copia); });
        return res;
      }).catch(function(){ return caches.match('./index.html'); });
    })
  );
});
