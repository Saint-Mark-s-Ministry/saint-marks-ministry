Pod::Spec.new do |s|
  s.name           = 'Passkeys'
  s.version        = '1.0.0'
  s.summary        = 'Passkey creation and sign-in through the system passkey sheet'
  s.description    = 'Wraps AuthenticationServices platform passkeys and returns the credential fields as base64url strings.'
  s.author         = 'St. Mark'
  s.homepage       = 'https://stmarkministry.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
end
