Pod::Spec.new do |s|
  s.name           = 'DuoLayout'
  s.version        = '1.0.0'
  s.summary        = 'iPhone Duo hinge, vertical bar and reserved regions (iOS 27.1)'
  s.description    = 'Reports the foldable hinge state, the vertical bar edge and reserved regions to JavaScript.'
  s.author         = 'St. Mark'
  s.homepage       = 'https://stmarkministry.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
end
